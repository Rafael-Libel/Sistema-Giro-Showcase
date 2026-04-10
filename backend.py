from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
import gspread
from oauth2client.service_account import ServiceAccountCredentials
import unicodedata
import re
from datetime import datetime
import os
import google.generativeai as genai
import json
from fastapi import File, UploadFile
import PyPDF2
import io
import pdfplumber
from fastapi.staticfiles import StaticFiles
import bcrypt

genai.configure(api_key="AIzaSyA-V5VnpTSCNycsb9C_zBDnxf1WGNNv9mY")

app = FastAPI(title="OmniTrack API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    
)
# --- COLE AQUI PARA LIBERTAR A PASTA STATIC ---
base_dir = os.path.dirname(os.path.abspath(__file__))
pasta_static = os.path.join(base_dir, "static")
if os.path.exists(pasta_static):
    app.mount("/static", StaticFiles(directory=pasta_static), name="static")
# ----------------------------------------------

ARQUIVO_CREDENCIAIS = "credentials.json"
PLANILHA_PAINEL_NOME = "PAINEL LOGISTICA_2026 - TESTE"

# ==========================================
# SISTEMA DE USUARIOS — POSTGRESQL + CRIPTOGRAFIA
# ==========================================
from sqlalchemy import create_engine, Column, String
from sqlalchemy.orm import declarative_base, sessionmaker
from passlib.context import CryptContext
import os

# Pega o link do banco da nuvem (ou usa um local de backup se estiver no seu PC)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./giro.db")

# Ajuste necessário para o Render e SQLAlchemy
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# --- NOVO MOTOR BLINDADO CONTRA QUEDAS ---
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # O Python dá um "ping" pra ver se o banco está acordado antes de pedir dados
    pool_recycle=300     # Recicla conexões a cada 5 minutos para evitar que a nuvem as derrube
)
# ----------------------------------------
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Desenhando a Tabela de Usuários no Banco
class UsuarioDB(Base):
    __tablename__ = "usuarios"
    usuario = Column(String, primary_key=True, index=True)
    senha = Column(String)  # Aqui fica o Hash (senha embaralhada)
    nome = Column(String)
    perfil = Column(String)

# Cria a tabela fisicamente na nuvem
Base.metadata.create_all(bind=engine)

# Motor de Criptografia (Direto com Bcrypt)
def gerar_hash(senha):
    # Transforma a senha em bytes, gera o salt e faz o hash
    salt = bcrypt.gensalt()
    senha_hash = bcrypt.hashpw(senha.encode('utf-8'), salt)
    return senha_hash.decode('utf-8')

def verificar_senha(senha_pura, senha_hash):
    # Testa se a senha digitada bate com o hash salvo no banco
    return bcrypt.checkpw(senha_pura.encode('utf-8'), senha_hash.encode('utf-8'))

# Injeta os 3 usuários chefes caso o banco esteja vazio
def inicializar_banco():
    db = SessionLocal()
    if db.query(UsuarioDB).count() == 0:
        usuarios_iniciais = [
            UsuarioDB(usuario="rafael", senha=gerar_hash("Faiston@26"), nome="Administrador", perfil="ADMIN"),
            UsuarioDB(usuario="logistica", senha=gerar_hash("Faiston@26"), nome="Equipe Logística", perfil="LOGISTICA"),
            UsuarioDB(usuario="marcelo", senha=gerar_hash("Faiston@26"), nome="Técnico Lab", perfil="LABORATORIO")
        ]
        db.add_all(usuarios_iniciais)
        db.commit()
    db.close()

inicializar_banco()

# ==========================================
# MODELOS DE DADOS
# ==========================================

class LoginRequest(BaseModel):
    usuario: str
    senha: str

class NovoUsuario(BaseModel):
    usuario: str
    senha: str
    nome: str
    perfil: str

class EquipamentoItem(BaseModel):
    projeto: str; serial: str; chamado: str; tipo: str; tecnico: str; rastreio: str; linha_planilha: int
    unidade: Optional[str] = "N/D"; cidade: Optional[str] = ""; uf: Optional[str] = ""; referencia: Optional[str] = ""

class SalvarRequest(BaseModel): itens: List[EquipamentoItem]
class LoteRequest(BaseModel): valores: List[str]
class RmaUpdateRequest(BaseModel): linha: int; dados: Dict[str, str]
class LabUpdateRequest(BaseModel): linha: int; ocorrencia: str; status_reparo: str; obs: str
class IARequest(BaseModel): prompt: str

# ==========================================
# ROTAS DE AUTENTICACAO E USUARIOS
# ==========================================

# ==========================================
# ROTAS DE AUTENTICACAO E USUARIOS
# ==========================================

@app.post("/api/login")
async def fazer_login(dados: LoginRequest):
    db = SessionLocal()
    user = dados.usuario.lower().strip()
    
    usuario_db = db.query(UsuarioDB).filter(UsuarioDB.usuario == user).first()
    db.close()

    if not usuario_db:
        raise HTTPException(status_code=401, detail="Usuário não encontrado!")
        
    if not verificar_senha(dados.senha, usuario_db.senha):
        raise HTTPException(status_code=401, detail="Senha incorreta!")
        
    return {
        "status": "sucesso",
        "dados": {
            "usuario": usuario_db.usuario,
            "nome": usuario_db.nome,
            "perfil": usuario_db.perfil
        }
    }

@app.post("/api/usuarios")
async def criar_usuario(dados: NovoUsuario):
    db = SessionLocal()
    user = dados.usuario.lower().strip()
    
    if db.query(UsuarioDB).filter(UsuarioDB.usuario == user).first():
        db.close()
        raise HTTPException(status_code=400, detail="Esse login já existe!")
        
    novo_user = UsuarioDB(
        usuario=user,
        senha=gerar_hash(dados.senha),
        nome=dados.nome.strip(),
        perfil=dados.perfil.upper()
    )
    
    db.add(novo_user)
    db.commit()
    db.close()
    
    return {"status": "sucesso", "mensagem": f"Usuário {dados.nome} cadastrado com sucesso!"}

@app.get("/api/usuarios")
async def listar_usuarios():
    db = SessionLocal()
    try:
        usuarios_db = db.query(UsuarioDB).all()
        # Monta a lista ANTES de fechar o banco
        lista = [{"usuario": u.usuario, "nome": u.nome, "perfil": u.perfil} for u in usuarios_db]
        return {"status": "sucesso", "dados": lista}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro no banco: {str(e)}")
    finally:
        # Garante que o banco fecha sempre no final
        db.close()

@app.delete("/api/usuarios/{usuario}")
async def deletar_usuario(usuario: str):
    user = usuario.lower().strip()
    if user == "rafael":
        raise HTTPException(status_code=403, detail="Não é possível remover o admin principal!")
        
    db = SessionLocal()
    usuario_db = db.query(UsuarioDB).filter(UsuarioDB.usuario == user).first()
    
    if not usuario_db:
        db.close()
        raise HTTPException(status_code=404, detail="Usuário não encontrado!")
        
    db.delete(usuario_db)
    db.commit()
    db.close()
    
    return {"status": "sucesso", "mensagem": f"Usuário '{user}' removido com sucesso!"}

# ==========================================
# HELPERS
# ==========================================

def get_client():
    scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
    creds = ServiceAccountCredentials.from_json_keyfile_name(ARQUIVO_CREDENCIAIS, scope)
    return gspread.authorize(creds)

def pad_linha(l): return list(l) + [""] * (35 - len(l)) if l else [""] * 35
def clean_val(valor): return str(valor).replace(".0", "").strip().upper() if valor else ""

def is_em_transito(row_pad):
    for c in row_pad:
        val = clean_val(c)
        val_sem_acento = ''.join(char for char in unicodedata.normalize('NFD', val) if unicodedata.category(char) != 'Mn')
        if "TRANSITO" in val_sem_acento or "POSTADO" in val_sem_acento: return True
    return False

# ==========================================
# ROTAS PRINCIPAIS
# ==========================================

@app.get("/")
def serve_frontend():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(base_dir, "index.html")
    if os.path.exists(file_path): return FileResponse(file_path)
    return HTMLResponse(content="<h1 style='color:red;'>Erro: index.html nao encontrado.</h1>", status_code=404)

@app.get("/api/dashboard/resumo")
def get_dashboard_resumo():
    try:
        client = get_client(); planilha = client.open(PLANILHA_PAINEL_NOME)
        try:
            ws_lab = planilha.worksheet("LAB").get_all_values()
            lab_fila = 0; lab_bancada = 0; lab_concluido = 0
            for row in ws_lab[1:]:
                r = pad_linha(row)
                if not clean_val(r[2]): continue
                oc = clean_val(r[6])
                if oc == "EM TESTE": lab_bancada += 1
                elif not oc or oc == "PENDENTE": lab_fila += 1
                else: lab_concluido += 1
        except: lab_fila = 0; lab_bancada = 0; lab_concluido = 0

        try:
            ws_rma = planilha.worksheet("RMA ARCOS DOURADOS").get_all_values()
            rma_pendente = 0; rma_concluido = 0
            for row in ws_rma[1:]:
                r = pad_linha(row)
                if not clean_val(r[0]): continue
                st = clean_val(r[14])
                if st == "CONCLUIDO": rma_concluido += 1
                else: rma_pendente += 1
        except: rma_pendente = 0; rma_concluido = 0

        bases_total = 0; transito_total = 0
        try:
            ws_arcos = planilha.worksheet("BASES_BRASIL").get_all_values()
            bases_total += len(ws_arcos) - 1 if len(ws_arcos) > 1 else 0
            transito_total += sum(1 for row in ws_arcos[1:] if is_em_transito(pad_linha(row)))
        except: pass
        try:
            ws_ntt = planilha.worksheet("BASES_NTT").get_all_values()
            bases_total += len(ws_ntt) - 1 if len(ws_ntt) > 1 else 0
            transito_total += sum(1 for row in ws_ntt[1:] if is_em_transito(pad_linha(row)))
        except: pass

        return {
            "status": "sucesso",
            "dados": {
                "lab": {"fila": lab_fila, "bancada": lab_bancada, "concluido": lab_concluido, "total": lab_fila + lab_bancada + lab_concluido},
                "rma": {"pendente": rma_pendente, "concluido": rma_concluido, "total": rma_pendente + rma_concluido},
                "logistica": {"bases": bases_total, "transito": transito_total}
            }
        }
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/buscar/{valor_bipado}")
def buscar_equipamento(valor_bipado: str):
    valor_bipado = clean_val(valor_bipado)
    termos_iniciais = [x.strip() for x in re.split(r'[/,\n;|\\]+', valor_bipado) if len(x.strip()) >= 4]
    if not termos_iniciais: termos_iniciais = [valor_bipado]

    encontrados = []; seriais_vistos = set()
    try:
        client = get_client(); planilha = client.open(PLANILHA_PAINEL_NOME)
        try: dados_arcos = planilha.worksheet("REVERSA ARCOS FILA 2.0").get_all_values()
        except: dados_arcos = []
        try: dados_ntt = planilha.worksheet("REVERSA").get_all_values()
        except: dados_ntt = []
        try: dados_trag = planilha.worksheet("TRAG").get_all_values()
        except: dados_trag = []
        try: dados_zamp = planilha.worksheet("REVERSA ZAMP").get_all_values()
        except: dados_zamp = []

        for aba_n, dados in [("ARCOS", dados_arcos), ("NTT", dados_ntt), ("TRAG", dados_trag), ("ZAMP", dados_zamp)]:
            if not dados or len(dados) < 2: continue
            if aba_n == "NTT": idx_r, idx_s, idx_c, idx_t, idx_m, idx_u, idx_cid, idx_uf = 6, 11, 3, 13, 10, 9, -1, -1
            elif aba_n == "ARCOS": idx_r, idx_s, idx_c, idx_t, idx_m, idx_u, idx_cid, idx_uf = 16, 9, 14, 10, 8, 2, 5, 6
            elif aba_n == "TRAG": idx_r, idx_s, idx_c, idx_t, idx_m, idx_u, idx_cid, idx_uf = 13, 10, 2, 3, 1, 5, 7, 8
            elif aba_n == "ZAMP": idx_r, idx_s, idx_c, idx_t, idx_m, idx_u, idx_cid, idx_uf = 5, 6, 3, -1, -1, -1, -1, -1

            rastreios_alvo = set(termos_iniciais)
            for i, linha_tuple in enumerate(dados[1:], start=2):
                linha_limpa = [clean_val(c) for c in pad_linha(linha_tuple)]
                v_r = linha_limpa[idx_r] if idx_r != -1 else ""
                v_s = linha_limpa[idx_s] if idx_s != -1 else ""
                v_c = linha_limpa[idx_c] if idx_c != -1 else ""

                if aba_n == "ARCOS":
                    v_postagem = linha_limpa[15]
                    v_ticket = linha_limpa[14]
                    match = any(r in v_r or r in v_postagem or r in v_ticket or r in v_s for r in rastreios_alvo)
                    v_r_display = v_r if v_r else (v_postagem if v_postagem else v_ticket)
                else:
                    match = any(r in v_r or r in v_s for r in rastreios_alvo)
                    v_r_display = v_r

                if match:
                    serial_limpo = v_s if v_s and v_s != "NONE" else "S/N"
                    if serial_limpo != "S/N":
                        if serial_limpo in seriais_vistos: continue
                        seriais_vistos.add(serial_limpo)
                    proj_nome = aba_n
                    if aba_n == "NTT":
                        is_rma = any("VIVO VITA" in str(x).upper() and "ARCOS DOURADOS" in str(x).upper() for x in linha_tuple)
                        proj_nome = "RMA - Arcos Dourados" if is_rma else "NTT"
                    encontrados.append({
                        "projeto": proj_nome, "serial": serial_limpo, "chamado": v_c,
                        "tipo": str(linha_limpa[idx_m]) if idx_m != -1 else ("Equipamento ZAMP" if aba_n == "ZAMP" else "N/D"),
                        "tecnico": str(linha_limpa[idx_t]) if idx_t != -1 else "N/D",
                        "rastreio": v_r_display, "linha_planilha": i,
                        "unidade": str(linha_limpa[idx_u]) if idx_u != -1 else "N/D",
                        "cidade": str(linha_limpa[idx_cid]) if idx_cid != -1 else "",
                        "uf": str(linha_limpa[idx_uf]) if idx_uf != -1 else "",
                        "referencia": str(linha_tuple[1]) if aba_n != "NTT" and len(linha_tuple) > 1 else ""
                    })
        if not encontrados: raise HTTPException(status_code=404, detail="Nenhum item localizado na planilha.")
        return {"status": "sucesso", "total": len(encontrados), "dados": encontrados}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/buscar_lote")
def buscar_equipamentos_lote(req: LoteRequest):
    termos_iniciais = set()
    for v in req.valores: termos_iniciais.add(clean_val(v))
    return buscar_equipamento(",".join(termos_iniciais))

@app.post("/api/salvar_recebimento")
def salvar_recebimento(req: SalvarRequest):
    try:
        client = get_client(); hoje_str = datetime.now().strftime("%d/%m/%Y")
        planilha_painel = client.open(PLANILHA_PAINEL_NOME)
        lote_ntt_lab = []

        try: ws_trag = planilha_painel.worksheet("TRAG")
        except: ws_trag = None
        try: ws_arcos = planilha_painel.worksheet("REVERSA ARCOS FILA 2.0")
        except: ws_arcos = None
        try: ws_ntt = planilha_painel.worksheet("REVERSA")
        except: ws_ntt = None
        try: ws_zamp = planilha_painel.worksheet("REVERSA ZAMP")
        except: ws_zamp = None
        try: ws_lab = planilha_painel.worksheet("LAB")
        except: ws_lab = None

        batch_trag = []; batch_arcos = []; batch_ntt = []; batch_zamp = []

        for item in req.itens:
            lp = item.linha_planilha
            serial_limpo = str(item.serial).strip().upper()

            if item.projeto == 'TRAG' and ws_trag:
                batch_trag.extend([{'range': f'L{lp}', 'values': [[hoje_str]]}, {'range': f'M{lp}', 'values': [['EM ESTOQUE']]}])
            elif item.projeto == 'ARCOS' and ws_arcos:
                batch_arcos.extend([{'range': f'T{lp}', 'values': [[hoje_str]]}, {'range': f'U{lp}', 'values': [['REVERSA CONCLUIDA']]}, {'range': f'W{lp}', 'values': [['CONCLUIDO']]}, {'range': f'Y{lp}', 'values': [[serial_limpo]]}])
            elif item.projeto in ['NTT', 'RMA - Arcos Dourados'] and ws_ntt:
                batch_ntt.extend([{'range': f'H{lp}', 'values': [[hoje_str]]}, {'range': f'I{lp}', 'values': [['ENTREGUE']]}, {'range': f'O{lp}', 'values': [['SIM']]}, {'range': f'Q{lp}', 'values': [[serial_limpo]]}])
                if item.projeto == 'NTT' and ws_lab:
                    lote_ntt_lab.append(["NTT", item.tipo, serial_limpo, "Pendente de Teste", hoje_str, "", "PENDENTE", "", "", item.chamado])
            elif item.projeto == 'ZAMP' and ws_zamp:
                batch_zamp.extend([{'range': f'E{lp}', 'values': [['ENTREGUE']]}, {'range': f'G{lp}', 'values': [[serial_limpo]]}])

        if batch_trag: ws_trag.batch_update(batch_trag, value_input_option='USER_ENTERED')
        if batch_arcos: ws_arcos.batch_update(batch_arcos, value_input_option='USER_ENTERED')
        if batch_ntt: ws_ntt.batch_update(batch_ntt, value_input_option='USER_ENTERED')
        if batch_zamp: ws_zamp.batch_update(batch_zamp, value_input_option='USER_ENTERED')

        if lote_ntt_lab and ws_lab:
            try:
                prox_lin = sum(1 for val in ws_lab.col_values(3) if str(val).strip() != "") + 1
                ws_lab.update(range_name=f"A{prox_lin}:J{prox_lin + len(lote_ntt_lab) - 1}", values=lote_ntt_lab, value_input_option='USER_ENTERED')
            except: pass

        return {"status": "sucesso", "mensagem": f"{len(req.itens)} itens salvos!"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/rma/buscar/{termo}")
def buscar_rma(termo: str):
    termo = clean_val(termo)
    try:
        ws_rma = get_client().open(PLANILHA_PAINEL_NOME).worksheet("RMA ARCOS DOURADOS")
        dados = ws_rma.get_all_values()
        cols_busca = [0, 2, 8, 10, 11]
        for i, row in enumerate(dados[1:], start=2):
            row_pad = pad_linha(row)
            if any(termo in clean_val(row_pad[c]) for c in cols_busca if c < len(row_pad)):
                return {"status": "sucesso", "linha": i, "dados": {"0": row_pad[0], "1": row_pad[1], "2": row_pad[2], "5": row_pad[5], "6": row_pad[6], "7": row_pad[7], "8": row_pad[8], "9": row_pad[9], "10": row_pad[10], "11": row_pad[11], "12": row_pad[12], "13": row_pad[13], "14": row_pad[14]}}
        raise HTTPException(status_code=404, detail="Nenhum RMA encontrado.")
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/rma/salvar")
def salvar_rma(req: RmaUpdateRequest):
    try:
        ws_rma = get_client().open(PLANILHA_PAINEL_NOME).worksheet("RMA ARCOS DOURADOS")
        celulas = []
        for col_idx_str, novo_valor in req.dados.items():
            col_planilha = int(col_idx_str) + 1
            celulas.append(gspread.Cell(req.linha, col_planilha, str(novo_valor).upper()))
        if celulas: ws_rma.update_cells(celulas)
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/kanban")
def get_kanban_completo():
    try:
        ws_rma = get_client().open(PLANILHA_PAINEL_NOME).worksheet("RMA ARCOS DOURADOS")
        dados = ws_rma.get_all_values()
        listas = {"faiston": [], "vita": [], "ups": [], "disponivel": []}
        for row in dados[1:]:
            row_pad = pad_linha(row)
            rma_val = clean_val(row_pad[0])
            if not rma_val: continue
            item = {"rma": rma_val, "pn": clean_val(row_pad[9]), "serial": clean_val(row_pad[10]), "status": clean_val(row_pad[14])}
            status_geral = item["status"]
            if status_geral in ["PENDENTE VITA VERIFICAR QUAL O SERIAL BAD", "PENDENTE VITA EMITIR NF DO GOOD", "AGUARDANDO RETORNO DO NOC", "SEM REGISTRO DO PEDIDO DE RMA"]: listas["vita"].append(item)
            elif status_geral == "CONCLUIDO": listas["disponivel"].append(item)
            elif "FAISTON" in status_geral: listas["faiston"].append(item)
            elif "UPS" in status_geral: listas["ups"].append(item)
        return {"status": "sucesso", "dados": listas}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/bases")
def get_bases():
    try:
        client = get_client(); planilha = client.open(PLANILHA_PAINEL_NOME); bases_mapa = []
        try:
            ws_arcos = planilha.worksheet("BASES_BRASIL").get_all_values()
            for row in ws_arcos[1:]:
                row_pad = pad_linha(row); coord_str = str(row_pad[9]).strip()
                if coord_str and "," in coord_str:
                    try:
                        lat, lng = map(float, coord_str.split(","))
                        bases_mapa.append({"projeto": "ARCOS", "nome": clean_val(row_pad[0]), "endereco": f"{str(row_pad[2]).strip()} - {clean_val(row_pad[3])}/{clean_val(row_pad[4])}", "lat": lat, "lng": lng, "info": f"MX: {row_pad[5]} | MS: {row_pad[6]} | MR: {row_pad[7]}", "em_transito": is_em_transito(row_pad)})
                    except: pass
        except: pass
        try:
            ws_ntt = planilha.worksheet("BASES_NTT").get_all_values()
            for row in ws_ntt[1:]:
                row_pad = pad_linha(row); coord_str = str(row_pad[7]).strip()
                if coord_str and "," in coord_str:
                    try:
                        lat, lng = map(float, coord_str.split(","))
                        bases_mapa.append({"projeto": "NTT", "nome": f"Base {clean_val(row_pad[1])}", "endereco": f"{str(row_pad[0]).strip()} - {clean_val(row_pad[1])}/{clean_val(row_pad[2])}", "lat": lat, "lng": lng, "info": f"SW: {clean_val(row_pad[4])} | Status: {clean_val(row_pad[3])}", "em_transito": is_em_transito(row_pad)})
                    except: pass
        except: pass
        return {"status": "sucesso", "total": len(bases_mapa), "dados": bases_mapa}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/lab")
def listar_lab():
    try:
        ws_lab = get_client().open(PLANILHA_PAINEL_NOME).worksheet("LAB")
        dados = ws_lab.get_all_values()
        lista = []
        for i, row in enumerate(dados[1:], start=2):
            r = pad_linha(row)
            serial = clean_val(r[2])
            if not serial: continue
            ocorrencia = clean_val(r[6])
            if not ocorrencia: ocorrencia = "PENDENTE"
            lista.append({"linha": i, "projeto": r[0], "equipamento": r[1], "serial": serial, "entrada": r[3], "data_entrada": r[4], "status_reparo": r[5], "ocorrencia": ocorrencia, "obs": r[7], "ticket": r[9]})
        return {"status": "sucesso", "dados": lista}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/lab/salvar")
def salvar_lab(req: LabUpdateRequest):
    try:
        ws_lab = get_client().open(PLANILHA_PAINEL_NOME).worksheet("LAB")
        celulas = [gspread.Cell(req.linha, 7, req.ocorrencia.upper()), gspread.Cell(req.linha, 6, req.status_reparo.upper()), gspread.Cell(req.linha, 8, req.obs.upper())]
        ws_lab.update_cells(celulas)
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# ROTAS DE IA
# ==========================================

@app.post("/api/ia/gerar_etiqueta")
def gerar_etiqueta_ia(req: IARequest):
    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        prompt_sistema = f"""
        Voce e um assistente de logistica. O usuario vai te pedir uma ou mais etiquetas.
        Responda EXCLUSIVAMENTE com uma LISTA (array []) de objetos JSON validos.
        Sem markdown, sem explicacoes. Apenas o JSON puro.
        Cada objeto deve conter:
        "tipo_etiqueta" (retorne LAUDO, ENTRADA ou EXPEDICAO),
        "projeto" (ex: ZAMP, ARCOS, NTT. Se nao achar, use N/D),
        "serial" (Se nao achar, use S/N),
        "pn" (Part Number ou modelo. Se nao achar, use N/A),
        "status" (GOOD ou BAD. So para LAUDO),
        "motivo" (Observacao. So para LAUDO),
        "chamado" (TK ou chamado. Para ENTRADA),
        "rastreio" (Codigo de postagem. Para ENTRADA),
        "nf" (Nota Fiscal. Para EXPEDICAO),
        "transportadora" (Nome da transportadora. Para EXPEDICAO. Se nao achar, use N/A)

        Pedido: "{req.prompt}"
        """
        response = model.generate_content(prompt_sistema)
        texto = response.text
        inicio = texto.find('[')
        fim = texto.rfind(']')
        if inicio != -1 and fim != -1 and fim > inicio:
            texto = texto[inicio:fim+1]
        else:
            inicio = texto.find('{')
            fim = texto.rfind('}')
            if inicio != -1 and fim != -1 and fim > inicio:
                texto = texto[inicio:fim+1]
        dados = json.loads(texto)
        if isinstance(dados, dict):
            dados = [dados]
        return {"status": "sucesso", "dados": dados}
    except Exception as e:
        print(f"Erro na conversao da IA: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ia/ler_nf")
async def ler_nf_visual(file: UploadFile = File(...)):
    try:
        pdf_bytes = await file.read()
        texto_visual = ""

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for pagina in pdf.pages:
                texto_visual += pagina.extract_text(layout=True) + "\n"

        linhas = texto_visual.split('\n')

        nf = "N/A"
        destinatario = "VERIFICAR NO PDF"
        endereco = ""
        municipio = ""
        fone = "N/A"
        volumes = "1"
        remetente = "N/D"

        # --- 1. BUSCA GLOBAL COM MÚLTIPLAS LINHAS ---
        # Remetente no topo
        m_rem = re.search(r'RECEBEMOS DE\s+(.*?)\s+OS PRODUTOS', texto_visual, re.DOTALL | re.IGNORECASE)
        if m_rem:
            remetente = m_rem.group(1).replace('\n', ' ').strip()
        
        # Backup do remetente
        if remetente == "N/D" or len(remetente) < 3:
            m_rem_alt = re.search(r'Identificação do Emitente\s*\n(.*?)\n', texto_visual, re.IGNORECASE)
            if m_rem_alt: remetente = m_rem_alt.group(1).strip()

        # Volumes
        m_vol = re.search(r'(?:QUANTIDADE|QTD|VOLUMES?)[\s\S]{1,150}?\n\s*(\d{1,4})\s*\n', texto_visual, re.IGNORECASE)
        if m_vol:
            volumes = str(int(m_vol.group(1)))

        # --- 2. SCANNER COM LOOKAHEAD (Busca até 5 linhas pra baixo ignorando lixo) ---
        for i, linha in enumerate(linhas):
            linha_upper = linha.upper()

            # NF
            if nf == "N/A" and ("Nº" in linha_upper or "N " in linha_upper or "N°" in linha_upper):
                m_nf = re.search(r'N[º°oO°]?\s*[:\.]?\s*([\d\.]+)', linha_upper)
                if m_nf:
                    nf_sujo = m_nf.group(1).replace('.', '').replace(',', '')
                    if len(nf_sujo) > 1 or nf_sujo != "1":  # Ignora se for a palavra SÉRIE 1
                        try: nf = str(int(nf_sujo))
                        except: nf = nf_sujo

            # Destinatario
            if ("NOME" in linha_upper or "RAZ" in linha_upper) and destinatario == "VERIFICAR NO PDF":
                for j in range(1, 6):
                    if i + j < len(linhas):
                        cand = linhas[i+j].strip()
                        # Ignora lixo visual do layout
                        if cand and not re.search(r'(DANFE|DOCUMENTO|ENTRADA|SA[IÍ]DA|SÉRIE|REMETENTE)', cand, re.IGNORECASE):
                            destinatario = re.split(r'\s{3,}', cand)[0]
                            break

            # Endereco
            if "ENDERE" in linha_upper and not endereco:
                for j in range(1, 5):
                    if i + j < len(linhas):
                        cand = linhas[i+j].strip()
                        if cand and not re.search(r'(DANFE|DOCUMENTO|SÉRIE|REMETENTE)', cand, re.IGNORECASE):
                            endereco = re.split(r'\s{3,}', cand)[0].replace('*', '').strip()
                            break

            # Municipio e Telefone
            if "MUNIC" in linha_upper and not municipio:
                for j in range(1, 5):
                    if i + j < len(linhas):
                        cand = linhas[i+j].strip()
                        if cand and not re.search(r'(DANFE|DOCUMENTO|SÉRIE|REMETENTE)', cand, re.IGNORECASE):
                            pedacos = re.split(r'\s{2,}', cand)
                            if len(pedacos) > 0: municipio = pedacos[0].strip()
                            if len(pedacos) > 1: fone = pedacos[1].strip()
                            break

        # Limpeza e Formatação
        endereco_final = endereco
        if municipio: endereco_final += f" / {municipio}"
        if not endereco_final.strip(): endereco_final = "VERIFICAR NO PDF"

        if remetente == "N/D": remetente = "IS TECH"

        dados_nf = {
            "destinatario": destinatario[:60],
            "endereco": endereco_final[:100],
            "nf": nf,
            "volumes": volumes,
            "contato": fone,
            "remetente": remetente[:50]
        }

        return {"status": "sucesso", "dados": dados_nf}

    except Exception as e:
        print(f"Erro no pdfplumber: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erro ao ler PDF visualmente: {str(e)}")
    
    