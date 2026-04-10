const FAISTON_LOGO_SVG = `<img src="https://faiston.com/wp-content/uploads/2025/07/faiston-servicos-de-tecnologia-e-consultoria-em-ti-para-empresas-footer-write.png" style="max-width: 100%; max-height: 50px;" alt="Logo Faiston">`;
        
        const AppState = {
            usuario: { id: null, nome: null, perfil: null },
            dashboards: { graficoLab: null, graficoRma: null },
            scanner: { rodando: false, alvo: '' },
            mapa: { instancia: null, marcadores: [], basesGlobais: [], marcadorOrigem: null, linhaRota: null },
            rma: { linhaAtual: null },
            lab: { itensGlobais: [] },
            lote: { memoria: [], itensConfirmadosSessao: [], ultimoResultado: [] }
        };


        let ultimoResultado = [];
        let itensConfirmadosSessao = [];
        let alvoScanAtual = '';
        let isScannerRunning = false;
        let linhaRmaAtual = null;
        let labItensGlobais = [];
        let memoriaLote = [];

        // Utilitários base
        async function apiFetch(url, options = {}) { const timeout = 60000; const controller = new AbortController(); const id = setTimeout(() => controller.abort(), timeout); try { options.headers = { ...options.headers, 'X-Tunnel-Skip-AntiPhishing-Page': 'true', 'Bypass-Tunnel-Reminder': 'true' }; const response = await fetch(url, { ...options, signal: controller.signal }); clearTimeout(id); const contentType = response.headers.get("content-type"); if (contentType && contentType.includes("text/html")) { throw new Error("Conexão bloqueada."); } return response; } catch (err) { clearTimeout(id); throw err; } }
        
        function toggleMobileMenu() {
            // Procura o menu lateral pelo ID (Geralmente é 'sidebar' ou 'menuLateral')
            const sidebar = document.getElementById('sidebar'); 
            
            if (sidebar) {
                // Se estiver escondido (fora da tela), ele puxa para dentro. Se estiver dentro, empurra para fora.
                sidebar.classList.toggle('-translate-x-full');
            }
        }
        
        function mostrarToast(mensagem, tipo = 'sucesso') { const container = document.getElementById('toastContainer'); const toast = document.createElement('div'); let corBorda, corIcone, icone; if (tipo === 'sucesso') { corBorda = 'border-emerald-500/50'; corIcone = 'text-emerald-400'; icone = 'fa-check-circle'; } else if (tipo === 'erro') { corBorda = 'border-red-500/50'; corIcone = 'text-red-400'; icone = 'fa-circle-xmark'; } else { corBorda = 'border-amber-500/50'; corIcone = 'text-amber-400'; icone = 'fa-triangle-exclamation'; } toast.className = `bg-slate-900 border ${corBorda} p-4 md:p-5 rounded-xl shadow-2xl flex items-center gap-4 w-80 md:w-96 toast-enter`; toast.innerHTML = `<i class="fa-solid ${icone} ${corIcone} text-2xl"></i><p class="text-sm md:text-base font-bold text-white">${mensagem}</p>`; container.appendChild(toast); setTimeout(() => { toast.classList.replace('toast-enter', 'toast-exit'); setTimeout(() => toast.remove(), 300); }, 3000); }

        // ==========================================
        // 2. SEGURANÇA (Login via API)
        // ==========================================
        async function fazerLogin() { 
            const user = document.getElementById('loginUser').value.trim(); 
            const pass = document.getElementById('loginPass').value.trim(); 
            
            if (!user || !pass) {
                mostrarToast("Preencha usuário e senha!", "aviso");
                return;
            }

            try {
                // Manda para o Python decidir se entra
                const res = await apiFetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ usuario: user, senha: pass })
                });

                const json = await res.json();

                if (!res.ok) {
                    mostrarToast(json.detail, "erro");
                    return;
                }

                // Salva no Estado Global de forma organizada
                AppState.usuario = {
                    id: json.dados.usuario,
                    nome: json.dados.nome,
                    perfil: json.dados.perfil
                };

                document.getElementById('lblNomeUsuario').innerText = AppState.usuario.nome; 
                document.getElementById('lblPerfilUsuario').innerText = AppState.usuario.perfil; 
                
                aplicarPermissoes(); 
                document.getElementById('telaLogin').classList.add('hidden'); 
                document.getElementById('appContainer').classList.remove('hidden'); 
                mudarAba('Home'); 
                mostrarToast(`Bem-vindo, ${AppState.usuario.nome}!`, "sucesso"); 

            } catch (error) {
                mostrarToast("Erro de conexão com o servidor.", "erro");
            }
        }

        function fazerLogout() { 
            AppState.usuario = { id: null, nome: null, perfil: null }; // Limpa o estado
            document.getElementById('loginUser').value = ''; 
            document.getElementById('loginPass').value = ''; 
            document.getElementById('appContainer').classList.add('hidden'); 
            document.getElementById('telaLogin').classList.remove('hidden'); 
            document.getElementById('telaLogin').classList.add('flex'); 
        }

        function aplicarPermissoes() { 
            const grupoLog = document.getElementById('grupoLogistica'); 
            const grupoLab = document.getElementById('grupoLaboratorio'); 
            const grupoAdmin = document.getElementById('grupoAdmin'); // Puxa o menu admin
            
            grupoLog.classList.remove('hidden'); 
            grupoLab.classList.remove('hidden'); 
            grupoAdmin.classList.add('hidden'); // Esconde o admin por padrão
            
            if (AppState.usuario.perfil === 'LOGISTICA') { 
                grupoLab.classList.add('hidden'); 
            } else if (AppState.usuario.perfil === 'LABORATORIO') { 
                grupoLog.classList.add('hidden'); 
            } else if (AppState.usuario.perfil === 'ADMIN') {
                grupoAdmin.classList.remove('hidden'); // Só o chefe vê isso!
            }
        }
        
        function mudarAba(aba) {
            if(window.innerWidth < 768) { toggleMobileMenu(); } 
            
            document.getElementById('telaHome').classList.add('hidden'); 
            document.getElementById('telaRecebimento').classList.add('hidden'); 
            document.getElementById('telaRMA').classList.add('hidden'); 
            document.getElementById('telaVisao').classList.add('hidden'); 
            document.getElementById('telaMapa').classList.add('hidden'); 
            document.getElementById('telaLab').classList.add('hidden');
            document.getElementById('telaBI').classList.add('hidden');
            document.getElementById('telaIA').classList.add('hidden');
            document.getElementById('telaUsuarios').classList.add('hidden');

            const btnHome = document.getElementById('menu-home'); 
            const btnRec = document.getElementById('menu-recebimento'); 
            const btnRmaBusca = document.getElementById('menu-rma-busca'); 
            const btnVisao = document.getElementById('menu-visao'); 
            const btnMapa = document.getElementById('menu-mapa'); 
            const btnLab = document.getElementById('menu-lab');
            const btnBI = document.getElementById('menu-bi');
            const btnIA = document.getElementById('menu-ia');

            const styleInativo = "w-full flex items-center gap-3 px-4 py-3.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl font-bold transition-all shadow-none border border-transparent";
            btnHome.className = styleInativo; btnRec.className = styleInativo; btnMapa.className = styleInativo; btnLab.className = styleInativo; btnBI.className = styleInativo; btnIA.className = styleInativo;
            btnRmaBusca.className = "w-full flex items-center gap-3 px-3 py-3 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg font-bold transition-all text-sm mt-1"; btnVisao.className = "w-full flex items-center gap-3 px-3 py-3 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg font-bold transition-all text-sm mb-1";
            
            const styleAtivo = "w-full flex items-center gap-3 px-4 py-3.5 bg-slate-800 text-indigo-400 rounded-xl font-bold border border-slate-700 transition-all shadow-sm";
            
            if (aba === 'Home') { document.getElementById('telaHome').classList.remove('hidden'); document.getElementById('telaHome').classList.add('flex'); btnHome.className = styleAtivo; carregarDashboard(); } 
            else if (aba === 'Recebimento') { document.getElementById('telaRecebimento').classList.remove('hidden'); document.getElementById('telaRecebimento').classList.add('flex'); btnRec.className = styleAtivo; } 
            else if (aba === 'RMA') { document.getElementById('telaRMA').classList.remove('hidden'); document.getElementById('telaRMA').classList.add('flex'); btnRmaBusca.className = "w-full flex items-center gap-3 px-3 py-3 bg-slate-800/80 text-indigo-400 rounded-lg font-bold transition-all text-sm mt-1 shadow-sm"; } 
            else if (aba === 'Visao') { document.getElementById('telaVisao').classList.remove('hidden'); document.getElementById('telaVisao').classList.add('flex'); btnVisao.className = "w-full flex items-center gap-3 px-3 py-3 bg-slate-800/80 text-indigo-400 rounded-lg font-bold transition-all text-sm mb-1 shadow-sm"; carregarKanban(); } 
            else if (aba === 'Mapa') { document.getElementById('telaMapa').classList.remove('hidden'); document.getElementById('telaMapa').classList.add('flex'); btnMapa.className = styleAtivo; iniciarMapaLojistico(); } 
            else if (aba === 'Lab') { document.getElementById('telaLab').classList.remove('hidden'); document.getElementById('telaLab').classList.add('flex'); btnLab.className = styleAtivo; carregarLab(); }
            else if (aba === 'BI') { document.getElementById('telaBI').classList.remove('hidden'); document.getElementById('telaBI').classList.add('flex'); btnBI.className = styleAtivo; }
            else if (aba === 'IA') { document.getElementById('telaIA').classList.remove('hidden'); document.getElementById('telaIA').classList.add('flex'); btnIA.className = "w-full flex items-center gap-3 px-4 py-3.5 text-emerald-400 bg-slate-800 rounded-xl font-bold transition-all mt-1 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]"; }
            else if (aba === 'Usuarios') { 
                document.getElementById('telaUsuarios').classList.remove('hidden'); 
                document.getElementById('telaUsuarios').classList.add('flex'); 
                carregarListaUsuarios(); 
            }
        }
        function toggleSubmenuRma() { const sub = document.getElementById('submenu-rma'); if (sub.classList.contains('max-h-0')) { sub.classList.remove('max-h-0', 'opacity-0'); sub.classList.add('max-h-40', 'opacity-100'); } else { sub.classList.add('max-h-0', 'opacity-0'); sub.classList.remove('max-h-40', 'opacity-100'); } }

        function wppDoDia() { if (itensConfirmadosSessao.length === 0) { mostrarToast("Nenhum equipamento confirmado!", "aviso"); return; } const dataHoje = new Date().toLocaleDateString('pt-BR'); let msg = `*RESUMO DE RECEBIMENTO (${dataHoje})*\n\n`; let agrupamento = {}; itensConfirmadosSessao.forEach(item => { let chave = `[${item.projeto}] CH: ${item.chamado}`; if (!agrupamento[chave]) agrupamento[chave] = {}; let rastreio = item.rastreio || "Sem Rastreio Vinculado"; if (!agrupamento[chave][rastreio]) agrupamento[chave][rastreio] = []; agrupamento[chave][rastreio].push(item); }); for (const [chave, rastreios] of Object.entries(agrupamento)) { msg += `*${chave}*\n`; for (const [rast, itens] of Object.entries(rastreios)) { msg += `📦 Rastreio: ${rast}\n`; itens.forEach(i => { msg += `  • S/N: ${i.serial} (${i.tipo})\n`; }); msg += `\n`; } } window.open(`https://wa.me/?text=${encodeURIComponent(msg.trim())}`, '_blank'); }

        async function carregarDashboard() { 
            document.getElementById('dashLabPendente').innerHTML = '<i class="fa-solid fa-spinner fa-spin text-2xl"></i>'; 
            document.getElementById('dashLabTotal').innerHTML = '-'; 
            document.getElementById('dashRmaPendente').innerHTML = '<i class="fa-solid fa-spinner fa-spin text-2xl"></i>'; 
            document.getElementById('dashRmaTotal').innerHTML = '-'; 
            document.getElementById('dashTransito').innerHTML = '<i class="fa-solid fa-spinner fa-spin text-2xl"></i>'; 
            document.getElementById('dashBases').innerHTML = '-'; 
            
            try { 
                const res = await apiFetch('/api/dashboard/resumo'); 
                if (res.ok) { 
                    const json = await res.json(); 
                    const d = json.dados; 
                    
                    document.getElementById('dashLabPendente').innerText = d.lab.fila + d.lab.bancada; 
                    document.getElementById('dashLabTotal').innerText = d.lab.total; 
                    document.getElementById('dashRmaPendente').innerText = d.rma.pendente; 
                    document.getElementById('dashRmaTotal').innerText = d.rma.total; 
                    document.getElementById('dashTransito').innerText = d.logistica.transito; 
                    document.getElementById('dashBases').innerText = d.logistica.bases; 
                    
                    Chart.defaults.color = '#94a3b8'; 
                    Chart.defaults.font.family = "'Inter', sans-serif"; 
                    
                    // GRÁFICO DO LAB (Usando o novo AppState)
                    const ctxLab = document.getElementById('chartLab').getContext('2d'); 
                    if (AppState.dashboards.graficoLab) AppState.dashboards.graficoLab.destroy(); 
                    
                    AppState.dashboards.graficoLab = new Chart(ctxLab, { 
                        type: 'doughnut', 
                        data: { 
                            labels: ['Na Fila', 'Em Teste', 'Laudo Emitido'], 
                            datasets: [{ data: [d.lab.fila, d.lab.bancada, d.lab.concluido], backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981'], borderWidth: 3, borderColor: '#1e293b', hoverOffset: 8 }] 
                        }, 
                        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true, pointStyle: 'circle' } } } } 
                    }); 
                    
                    // GRÁFICO DO RMA (Usando o novo AppState)
                    const ctxRma = document.getElementById('chartRma').getContext('2d'); 
                    if (AppState.dashboards.graficoRma) AppState.dashboards.graficoRma.destroy(); 
                    
                    AppState.dashboards.graficoRma = new Chart(ctxRma, { 
                        type: 'doughnut', 
                        data: { 
                            labels: ['Pendente', 'Concluído'], 
                            datasets: [{ data: [d.rma.pendente, d.rma.concluido], backgroundColor: ['#f59e0b', '#10b981'], borderWidth: 3, borderColor: '#1e293b', hoverOffset: 8 }] 
                        }, 
                        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true, pointStyle: 'circle' } } } } 
                    }); 
                } 
            } catch (e) {
                console.error("Erro ao carregar gráficos:", e);
            } 
        }

        function abrirCamera(alvo) { alvoScanAtual = alvo; document.getElementById('modalScanner').classList.remove('hidden'); document.getElementById('modalScanner').classList.add('flex'); Quagga.init({ inputStream: { name: "Live", type: "LiveStream", target: document.querySelector('#interactive'), constraints: { width: { min: 640 }, height: { min: 480 }, facingMode: "environment", aspectRatio: { min: 1, max: 2 } } }, locator: { patchSize: "medium", halfSample: true }, numOfWorkers: navigator.hardwareConcurrency || 4, decoder: { readers: ["code_128_reader", "code_39_reader", "ean_reader", "upc_reader"] }, locate: true }, function(err) { if (err) { mostrarToast("Erro na câmera.", "erro"); fecharScanner(); return; } Quagga.start(); isScannerRunning = true; }); Quagga.onDetected(onScanSuccess); }
        
        function fecharScanner() { 
            document.getElementById('modalScanner').classList.add('hidden'); 
            document.getElementById('modalScanner').classList.remove('flex'); 
            if (isScannerRunning) { Quagga.stop(); Quagga.offDetected(onScanSuccess); isScannerRunning = false; } 
        }

        function onScanSuccess(result) { const decodedText = result.codeResult.code; fecharScanner(); mostrarToast("Lido: " + decodedText, "sucesso"); if (alvoScanAtual === 'busca') { document.getElementById('inputBusca').value = decodedText; buscar(); } else if (alvoScanAtual === 'lote') { document.getElementById('inputLote').value = decodedText; addLote(); } }

        async function buscar() { const valor = document.getElementById('inputBusca').value.trim(); if (!valor) return; const divResultado = document.getElementById('resultadoBusca'); const divLoading = document.getElementById('loading'); divResultado.innerHTML = ''; divLoading.classList.remove('hidden'); divLoading.classList.add('flex'); try { const resposta = await apiFetch(`/api/buscar/${encodeURIComponent(valor)}`); const json = await resposta.json(); if (!resposta.ok) { divResultado.innerHTML = `<div class="w-full p-5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 font-bold text-base text-center card-neo"><i class="fa-solid fa-circle-info mr-1"></i> ${json.detail}</div>`; return; } ultimoResultado = json.dados; document.getElementById('inputBusca').value = ''; renderizarCartoes(ultimoResultado); } catch (erro) { divResultado.innerHTML = `<div class="w-full p-5 bg-red-500/10 text-red-400 font-bold text-base text-center border border-red-500/30 rounded-xl card-neo"><i class="fa-solid fa-wifi mr-1"></i> Falha na conexão.</div>`; } finally { divLoading.classList.add('hidden'); divLoading.classList.remove('flex'); } }
        function renderizarCartoes(lista) { const divResultado = document.getElementById('resultadoBusca'); if (lista.length === 0) { divResultado.innerHTML = ''; return; } let linhasHtml = ''; lista.forEach((item, index) => { let corTag = item.projeto === 'ARCOS' ? 'text-pink-400 bg-pink-400/10' : (item.projeto.includes('NTT') ? 'text-amber-400 bg-amber-400/10' : 'text-emerald-400 bg-emerald-400/10'); let tecnicoStr = item.tecnico && item.tecnico !== "N/D" ? item.tecnico : "Téc. não informado"; let localStr = item.cidade && item.uf ? `${item.cidade}/${item.uf}` : "Local não informado"; linhasHtml += `<div id="row_${index}" class="card-neo flex flex-col md:flex-row md:items-center gap-4 md:gap-5 py-4 px-5 rounded-xl transition-all border border-slate-700/50 w-full mb-3"><div class="flex items-center gap-4"><input type="checkbox" id="check_${index}" class="w-6 h-6 accent-indigo-600 cursor-pointer rounded-md" checked><span class="text-[10px] font-bold px-2.5 py-1 rounded ${corTag} uppercase tracking-widest shrink-0">${item.projeto}</span><span class="md:hidden text-slate-300 text-sm font-bold">CH: ${item.chamado}</span></div><div class="hidden md:flex w-40 flex-col justify-center shrink-0"><span class="text-slate-300 text-sm font-bold truncate">CH: ${item.chamado}</span><span class="text-slate-500 text-[11px] font-medium truncate mt-1"><i class="fa-solid fa-user-astronaut mr-1 opacity-70"></i>${tecnicoStr}</span></div><div class="w-full md:w-48 flex flex-col justify-center shrink-0"><span class="text-slate-200 text-base font-bold truncate">${item.tipo}</span><span class="text-slate-500 text-[11px] font-medium truncate mt-1"><i class="fa-solid fa-location-dot mr-1 opacity-70"></i>${localStr}</span></div><div class="w-full md:flex-1 relative"><input type="text" id="serial_${index}" value="${item.serial}" class="w-full bg-slate-950/40 border border-slate-700/60 focus:bg-slate-900 focus:border-indigo-500 px-4 py-3 rounded-lg text-sm tracking-wide font-bold text-indigo-50 placeholder-slate-600" placeholder="Bipe o serial..." /></div><div class="hidden md:flex w-auto justify-end items-center gap-3 shrink-0"><span id="status_badge_${index}" class="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center justify-end gap-1.5"><i class="fa-solid fa-clock opacity-70"></i> Pendente</span><button onclick="imprimirEtiquetaEntrada(${index}, '${item.chamado}', '${item.tipo}', '${item.rastreio}', '${item.projeto}')" class="text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20 z-10" title="Imprimir Etiqueta de Entrada"><i class="fa-solid fa-print"></i></button></div></div>`; }); divResultado.innerHTML = `<div class="card-neo rounded-2xl flex flex-col shadow-lg border border-slate-700/50 w-full max-w-full"><div class="p-5 md:p-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-b border-slate-800"><div><h3 class="font-bold text-white text-lg md:text-xl tracking-tight">Lote de Recebimento</h3><p class="text-xs text-slate-400 mt-1">${lista.length} encontrados</p></div><div class="flex items-center gap-3 bg-slate-900 px-4 py-2 rounded-xl border border-slate-800 w-fit"><label for="checkAll" class="text-sm font-bold text-slate-400 cursor-pointer">Selecionar Todos</label><input type="checkbox" id="checkAll" class="w-5 h-5 accent-indigo-600 cursor-pointer rounded-sm" checked onclick="toggleAllChecks()"></div></div><div class="w-full overflow-x-auto kanban-scroll"><div class="flex flex-col px-4 pb-2 mt-4 min-w-full md:min-w-[800px]">${linhasHtml}</div></div><div class="p-5 bg-slate-900/50 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4"><span class="text-xs text-slate-500 text-center md:text-left"><i class="fa-solid fa-circle-info mr-1"></i> Preencha os seriais vazios.</span><button id="btnConfirmarLote" onclick="confirmarLoteChecklist()" class="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3.5 rounded-xl text-base font-bold shadow-md transition-colors flex items-center justify-center gap-2"><i class="fa-solid fa-cloud-arrow-up"></i> Confirmar Selecionados</button></div></div>`; }
        function toggleAllChecks() { const isChecked = document.getElementById('checkAll').checked; ultimoResultado.forEach((_, index) => { const cb = document.getElementById(`check_${index}`); if(cb && !cb.disabled) cb.checked = isChecked; }); }
        
        async function confirmarLoteChecklist() { const btn = document.getElementById('btnConfirmarLote'); btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true; let itensParaSalvar = []; let indicesSalvos = []; ultimoResultado.forEach((item, index) => { const cb = document.getElementById(`check_${index}`); if (cb && cb.checked && !cb.disabled) { let itemCopia = {...item}; itemCopia.serial = document.getElementById(`serial_${index}`).value.trim(); itensParaSalvar.push(itemCopia); indicesSalvos.push(index); } }); if (itensParaSalvar.length === 0) { mostrarToast("Selecione um item!", "aviso"); btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Confirmar'; btn.disabled = false; return; } try { const res = await apiFetch('/api/salvar_recebimento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens: itensParaSalvar }) }); if (res.ok) { mostrarToast("Salvo com sucesso!", "sucesso"); btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Salvo'; btn.classList.replace('bg-indigo-600', 'bg-emerald-600'); indicesSalvos.forEach(idx => { document.getElementById(`check_${idx}`).disabled = true; document.getElementById(`serial_${idx}`).disabled = true; document.getElementById(`row_${idx}`).classList.add('opacity-70'); document.getElementById(`row_${idx}`).classList.remove('card-neo'); const badge = document.getElementById(`status_badge_${idx}`); if(badge) { badge.innerHTML = '<i class="fa-solid fa-check"></i> Salvo'; badge.className = 'text-[11px] font-bold text-emerald-500 uppercase tracking-widest flex items-center justify-end gap-1.5'; } }); itensConfirmadosSessao.push(...itensParaSalvar); document.getElementById('wppCounter').innerText = `Wpp (${itensConfirmadosSessao.length})`; setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Confirmar Restantes'; btn.classList.replace('bg-emerald-600', 'bg-indigo-600'); btn.disabled = false; }, 3000); } else { mostrarToast("Erro ao salvar.", "erro"); btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Tentar Novamente'; btn.disabled = false; } } catch (error) { mostrarToast("Falha na conexão.", "erro"); btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Tentar Novamente'; btn.disabled = false; } }

        function abrirModalLote() { document.getElementById('modalLote').classList.remove('hidden'); document.getElementById('modalLote').classList.add('flex'); setTimeout(() => document.getElementById('inputLote').focus(), 100); }
        function fecharModalLote() { document.getElementById('modalLote').classList.add('hidden'); document.getElementById('modalLote').classList.remove('flex'); }
        function limparLote() { memoriaLote = []; document.getElementById('listaLote').innerHTML = ''; document.getElementById('loteCount').innerText = '0'; document.getElementById('inputLote').focus(); }
        function addLote() { const input = document.getElementById('inputLote'); const val = input.value.trim().toUpperCase(); if (val && !memoriaLote.includes(val)) { memoriaLote.push(val); const ul = document.getElementById('listaLote'); ul.innerHTML += `<li class="flex items-center gap-2 text-emerald-400 card-neo p-2 rounded-lg mb-1"><i class="fa-solid fa-check"></i> ${val}</li>`; document.getElementById('loteCount').innerText = memoriaLote.length; ul.scrollTop = ul.scrollHeight; } input.value = ''; input.focus(); }
        async function buscarLoteAPI() { if (memoriaLote.length === 0) return; fecharModalLote(); const divResultado = document.getElementById('resultadoBusca'); const divLoading = document.getElementById('loading'); divResultado.innerHTML = ''; divLoading.classList.remove('hidden'); divLoading.classList.add('flex'); try { const resposta = await apiFetch('/api/buscar_lote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valores: memoriaLote }) }); const json = await resposta.json(); divLoading.classList.add('hidden'); divLoading.classList.remove('flex'); if (!resposta.ok) { divResultado.innerHTML = `<div class="w-full p-5 bg-red-500/10 text-red-400 font-bold text-base border border-red-500/30 rounded-xl card-neo">${json.detail}</div>`; return; } ultimoResultado = json.dados; renderizarCartoes(ultimoResultado); limparLote(); } catch (erro) { divLoading.classList.add('hidden'); divLoading.classList.remove('flex'); divResultado.innerHTML = `<div class="w-full p-5 bg-red-500/10 text-red-400 font-bold text-base card-neo">Erro de conexão.</div>`; } }

        function iniciarMapaLojistico() { 
            if (AppState.mapa.instancia !== null) return; 
            
            AppState.mapa.instancia = L.map('mapaContainer', {zoomControl: false}).setView([-14.235, -51.925], 4); 
            
            L.control.zoom({ position: 'bottomright' }).addTo(AppState.mapa.instancia); 
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { 
                attribution: '© OpenStreetMap', 
                maxZoom: 19 
            }).addTo(AppState.mapa.instancia); 
            
            carregarBasesNoMapa(); 
        }           
        
        async function carregarBasesNoMapa() { 
            try { 
                const resposta = await apiFetch('/api/bases'); 
                const json = await resposta.json(); 
                if(json.status === "sucesso") { 
                    AppState.mapa.basesGlobais = json.dados; 
                    document.getElementById('qtdBasesMapa').innerText = `${AppState.mapa.basesGlobais.length} bases`; 
                    
                    AppState.mapa.basesGlobais.forEach(base => { 
                        let htmlIcone = ''; 
                        if (base.em_transito) { 
                            htmlIcone = '<div class="truck-wrapper"><div class="truck-shadow"></div><i class="fa-solid fa-truck-fast truck-icon"></i></div>'; 
                        } else { 
                            htmlIcone = base.projeto === 'ARCOS' ? '<div class="glow-arcos"></div>' : '<div class="glow-ntt"></div>'; 
                        } 
                        
                        const icone = L.divIcon({html: htmlIcone, className: '', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15]}); 
                        const corProjeto = base.projeto === 'ARCOS' ? 'text-pink-400 bg-pink-400/10 border border-pink-400/20' : 'text-amber-400 bg-amber-400/10 border border-amber-400/20'; 
                        const badgeTransito = base.em_transito ? '<span class="text-[9px] font-bold px-2 py-0.5 rounded border border-sky-500/50 text-sky-400 bg-sky-400/10 uppercase tracking-widest ml-2"><i class="fa-solid fa-truck-fast"></i> Trânsito</span>' : ''; 
                        
                        const marker = L.marker([base.lat, base.lng], {icon: icone}).addTo(AppState.mapa.instancia); 
                        marker.bindPopup(`<div class="p-2 min-w-[200px]"><div class="flex items-center mb-2"><span class="text-[9px] font-bold px-2 py-0.5 rounded ${corProjeto} uppercase tracking-widest">${base.projeto}</span>${badgeTransito}</div><h3 class="font-bold text-white text-sm tracking-tight">${base.nome}</h3><p class="text-[10px] text-slate-400 mt-1 leading-snug">${base.endereco}</p><div class="mt-2 pt-2 border-t border-slate-700/80 bg-slate-900/50 -mx-2 -mb-2 p-2 rounded-b-lg"><p class="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Estoque</p><p class="text-[10px] font-semibold text-emerald-400">${base.info}</p></div></div>`); 
                        
                        AppState.mapa.marcadores.push(marker); 
                    }); 
                } 
            } catch (error) {
                console.error("Erro ao carregar bases:", error);
            } 
        }

        
        function calcularDistanciaKm(lat1, lon1, lat2, lon2) { const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180; const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2); return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); }
        async function buscarBaseProxima() { 
            const cep = document.getElementById('inputCepMapa').value.replace(/\D/g, ''); 
            if(cep.length !== 8) { mostrarToast("Digite um CEP válido.", "aviso"); return; } 
            
            if(AppState.mapa.basesGlobais.length === 0) return; 
            
            const loader = document.getElementById('loaderMapa'); 
            const cardRes = document.getElementById('cardBaseProxima'); 
            const projetoSelecionado = document.getElementById('selectProjetoMapa').value; 
            
            loader.classList.remove('hidden'); 
            loader.classList.add('flex'); 
            cardRes.classList.add('hidden'); 
            
            try { 
                const resCep = await fetch(`https://viacep.com.br/ws/${cep}/json/`); 
                const dadosCep = await resCep.json(); 
                if (dadosCep.erro) throw new Error("CEP não localizado."); 

                let latOrigem, lngOrigem; 
                let geocodeEncontrado = false; 
                const query = `${dadosCep.logradouro}, ${dadosCep.localidade}, ${dadosCep.uf}, Brazil`; 
                
                const resGeocode = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`); 
                const dadosGeocode = await resGeocode.json(); 
                
                if (dadosGeocode.length > 0) { 
                    latOrigem = parseFloat(dadosGeocode[0].lat); 
                    lngOrigem = parseFloat(dadosGeocode[0].lon); 
                    geocodeEncontrado = true; 
                } 

                if (!geocodeEncontrado) throw new Error("O GPS não localizou este CEP."); 

                let basesFiltradas = AppState.mapa.basesGlobais; 
                if (projetoSelecionado !== "TODOS") { 
                    basesFiltradas = AppState.mapa.basesGlobais.filter(b => b.projeto === projetoSelecionado); 
                } 

                let basesDisponiveis = basesFiltradas.filter(b => !b.em_transito); 
                if (basesDisponiveis.length === 0) throw new Error(`Nenhuma base física para o projeto ${projetoSelecionado}.`); 

                let baseMaisProxima = null; 
                let menorDistancia = Infinity; 

                basesDisponiveis.forEach(base => { 
                    const dist = calcularDistanciaKm(latOrigem, lngOrigem, base.lat, base.lng); 
                    if (dist < menorDistancia) { menorDistancia = dist; baseMaisProxima = base; } 
                }); 

                // Atualiza Visual e Rota no Mapa
                cardRes.classList.remove('hidden'); 
                cardRes.classList.add('flex'); 
                document.getElementById('resNomeBase').innerText = baseMaisProxima.nome; 
                document.getElementById('resEnderecoBase').innerText = baseMaisProxima.endereco; 
                document.getElementById('resDistancia').innerText = `${menorDistancia.toFixed(1)} km`;

                if (AppState.mapa.marcadorOrigem) AppState.mapa.instancia.removeLayer(AppState.mapa.marcadorOrigem); 
                if (AppState.mapa.linhaRota) AppState.mapa.instancia.removeLayer(AppState.mapa.linhaRota); 

                const iconeUser = L.divIcon({html: '<i class="fa-solid fa-location-dot text-4xl text-indigo-500"></i>', className: '', iconAnchor: [12, 35]}); 
                AppState.mapa.marcadorOrigem = L.marker([latOrigem, lngOrigem], {icon: iconeUser}).addTo(AppState.mapa.instancia); 
                
                AppState.mapa.linhaRota = L.polyline([[latOrigem, lngOrigem], [baseMaisProxima.lat, baseMaisProxima.lng]], {color: '#6366f1', weight: 4}).addTo(AppState.mapa.instancia); 
                AppState.mapa.instancia.fitBounds(AppState.mapa.linhaRota.getBounds(), {padding: [50, 50]}); 

            } catch(e) { 
                mostrarToast(e.message, "erro"); 
            } finally { 
                loader.classList.add('hidden'); 
            } 
        }
        function atualizarCoresBlocos() { const isPendente = (v) => { if (!v || v.trim() === "" || v === "Selecione...") return true; return v.toUpperCase().includes("PENDENT") || v.toUpperCase().includes("TRATATIVA") || v.toUpperCase().includes("AGUARDANDO") || v.toUpperCase().includes("N/D"); }; const inputsBad = [ document.getElementById('rma_5').value, document.getElementById('rma_6').value, document.getElementById('rma_7').value, document.getElementById('rma_8').value ]; const inputsGood = [ document.getElementById('rma_9').value, document.getElementById('rma_10').value, document.getElementById('rma_11').value, document.getElementById('rma_12').value, document.getElementById('rma_13').value, document.getElementById('rma_14').value ]; const todosInputs = [...inputsBad, ...inputsGood]; const blocoBad = document.getElementById('blocoBad'); blocoBad.classList.remove('caixa-pendente', 'caixa-concluida'); if (inputsBad.some(isPendente)) { blocoBad.classList.add('caixa-pendente'); } else { blocoBad.classList.add('caixa-concluida'); } const blocoGood = document.getElementById('blocoGood'); blocoGood.classList.remove('caixa-pendente', 'caixa-concluida'); if (inputsGood.some(isPendente)) { blocoGood.classList.add('caixa-pendente'); } else { blocoGood.classList.add('caixa-concluida'); } const banner = document.getElementById('bannerStatusRMA'); const txtBanner = document.getElementById('txtBannerStatus'); const temPendencia = todosInputs.some(isPendente); if(temPendencia) { banner.style.backgroundColor = "rgba(168, 85, 247, 0.1)"; banner.style.borderColor = "#a855f7"; banner.style.color = "#a855f7"; txtBanner.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> INDISPONÍVEL'; } else { banner.style.backgroundColor = "rgba(16, 185, 129, 0.1)"; banner.style.borderColor = "#10b981"; banner.style.color = "#10b981"; txtBanner.innerHTML = '<i class="fa-solid fa-circle-check"></i> DISPONÍVEL'; } }
        async function buscarRMA() { const termo = document.getElementById('inputBuscaRMA').value.trim(); if (!termo) return; const formRMA = document.getElementById('formRMA'); const divLoading = document.getElementById('loadingRMA'); formRMA.classList.add('hidden'); divLoading.classList.remove('hidden'); divLoading.classList.add('flex'); try { const resposta = await apiFetch(`/api/rma/buscar/${encodeURIComponent(termo)}`); const json = await resposta.json(); divLoading.classList.add('hidden'); divLoading.classList.remove('flex'); if (!resposta.ok) { mostrarToast(json.detail, "erro"); return; } linhaRmaAtual = json.linha; const d = json.dados; document.getElementById('lblRmaIdentificacao').innerText = d["0"] || 'N/D'; document.getElementById('lblRmaChamado').innerText = `CHAMADO: ${d["2"] || 'N/D'} | CONTROLE: ${d["1"] || 'N/D'}`; const cbBad = document.getElementById('rma_5'); if(d["5"] && ![...cbBad.options].some(o => o.value === d["5"])) cbBad.add(new Option(d["5"], d["5"])); cbBad.value = d["5"] || ""; const cbPN = document.getElementById('rma_9'); if(d["9"] && ![...cbPN.options].some(o => o.value === d["9"])) cbPN.add(new Option(d["9"], d["9"])); cbPN.value = d["9"] || ""; const cbGood = document.getElementById('rma_13'); if(d["13"] && ![...cbGood.options].some(o => o.value === d["13"])) cbGood.add(new Option(d["13"], d["13"])); cbGood.value = d["13"] || ""; const cbGeral = document.getElementById('rma_14'); if(d["14"] && ![...cbGeral.options].some(o => o.value === d["14"])) cbGeral.add(new Option(d["14"], d["14"])); cbGeral.value = d["14"] || ""; document.getElementById('rma_6').value = d["6"] || ""; document.getElementById('rma_7').value = d["7"] || ""; document.getElementById('rma_8').value = d["8"] || ""; document.getElementById('rma_10').value = d["10"] || ""; document.getElementById('rma_11').value = d["11"] || ""; document.getElementById('rma_12').value = d["12"] || ""; atualizarCoresBlocos(); formRMA.classList.remove('hidden'); formRMA.classList.add('flex'); document.getElementById('inputBuscaRMA').value = ''; } catch (erro) { divLoading.classList.add('hidden'); divLoading.classList.remove('flex'); mostrarToast("Erro de rede. Tente de novo.", "erro"); } }
        async function salvarRMA() { if (!linhaRmaAtual) return; const btn = document.getElementById('btnSalvarRMA'); btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SALVANDO...'; btn.disabled = true; const payload = { linha: linhaRmaAtual, dados: { "5": document.getElementById('rma_5').value, "6": document.getElementById('rma_6').value, "7": document.getElementById('rma_7').value, "8": document.getElementById('rma_8').value, "9": document.getElementById('rma_9').value, "10": document.getElementById('rma_10').value, "11": document.getElementById('rma_11').value, "12": document.getElementById('rma_12').value, "13": document.getElementById('rma_13').value, "14": document.getElementById('rma_14').value } }; try { const res = await apiFetch(`/api/rma/salvar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (res.ok) { mostrarToast("Atualizado!", "sucesso"); document.getElementById('inputBuscaRMA').value = document.getElementById('rma_10').value || document.getElementById('rma_8').value; buscarRMA(); } else { mostrarToast("Erro ao salvar.", "erro"); } } catch (e) { mostrarToast("Falha na API.", "erro"); } finally { btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> SALVAR'; btn.disabled = false; } }

        async function carregarKanban() { const loader = document.getElementById('loadingVisao'); loader.classList.remove('hidden'); loader.classList.add('flex'); try { const resposta = await apiFetch('/api/kanban'); if (!resposta.ok) throw new Error("Erro no servidor"); const json = await resposta.json(); renderizarColunaKanban('colFaiston', 'countFaiston', json.dados.faiston, 'blue-500'); renderizarColunaKanban('colVita', 'countVita', json.dados.vita, 'emerald-500'); renderizarColunaKanban('colUps', 'countUps', json.dados.ups, 'purple-500'); renderizarColunaKanban('colDisp', 'countDisp', json.dados.disponivel, 'teal-500'); } catch (error) { mostrarToast("Erro ao conectar na planilha.", "erro"); } finally { loader.classList.add('hidden'); loader.classList.remove('flex'); } }
        function renderizarColunaKanban(idColuna, idContador, dados, corTailwind) { const coluna = document.getElementById(idColuna); document.getElementById(idContador).innerText = dados.length; coluna.innerHTML = ''; if(dados.length === 0) { coluna.innerHTML = `<div class="text-center text-slate-500 font-bold text-xs mt-4 card-neo p-4 rounded-xl">Vazio</div>`; return; } dados.forEach(item => { coluna.innerHTML += `<div onclick="abrirRmaPeloKanban('${item.rma}')" class="card-neo border border-slate-700 p-3 md:p-4 rounded-xl cursor-pointer transition-all shadow-sm hover:border-${corTailwind} mb-3"><p class="text-[10px] md:text-xs text-slate-400 font-bold tracking-widest mb-1.5">RMA: ${item.rma}</p><p class="text-sm md:text-base font-bold text-slate-200 mb-3">${item.serial || 'S/N'}</p><span class="text-[9px] md:text-[10px] bg-slate-900 border border-slate-700 px-2 py-1 rounded text-slate-300 font-bold break-words line-clamp-2" title="${item.status}">${item.status}</span></div>`; }); }
        function abrirRmaPeloKanban(rma) { mudarAba('RMA'); const sub = document.getElementById('submenu-rma'); if (sub.classList.contains('max-h-0')) { sub.classList.remove('max-h-0', 'opacity-0'); sub.classList.add('max-h-40', 'opacity-100'); } document.getElementById('inputBuscaRMA').value = rma; buscarRMA(); }

        async function carregarLab() { const loader = document.getElementById('loadingLab'); loader.classList.remove('hidden'); loader.classList.add('flex'); try { const resposta = await apiFetch('/api/lab'); const json = await resposta.json(); if(json.status === "sucesso") { labItensGlobais = json.dados; renderizarKanbanLab(); } } catch (error) { mostrarToast("Erro de rede no Lab.", "erro"); } finally { loader.classList.add('hidden'); loader.classList.remove('flex'); } }
        function renderizarKanbanLab() { const colFila = document.getElementById('colLabFila'); const colBancada = document.getElementById('colLabBancada'); const colFim = document.getElementById('colLabFim'); colFila.innerHTML = ''; colBancada.innerHTML = ''; colFim.innerHTML = ''; let contFila = 0; let contBancada = 0; let contFim = 0; const campoBusca = document.getElementById('inputBuscaLab'); const termoBusca = campoBusca ? campoBusca.value.trim().toUpperCase() : ''; labItensGlobais.forEach((item, index) => { if (termoBusca) { const textoDoCard = `${item.serial} ${item.ticket} ${item.projeto} ${item.equipamento}`.toUpperCase(); if (!textoDoCard.includes(termoBusca)) return; } const isPendente = item.ocorrencia === 'PENDENTE' || item.ocorrencia === ''; const isEmTeste = item.ocorrencia === 'EM TESTE'; const isFinalizado = !isPendente && !isEmTeste; let badgeCor = 'bg-slate-900 border-slate-700 text-slate-400'; if(item.ocorrencia.includes('OK')) badgeCor = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'; if(item.ocorrencia.includes('BAD')) badgeCor = 'bg-red-500/10 border-red-500/30 text-red-400'; if(isEmTeste) badgeCor = 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'; let botoes = ''; let acaoClique = ''; let cursorHover = ''; let iconeVer = ''; if (isPendente) { botoes = `<button onclick="iniciarTesteLab(${item.linha})" class="w-full mt-3 bg-slate-700 hover:bg-indigo-600 text-white py-3 rounded-lg text-xs md:text-sm font-bold transition-all shadow-md"><i class="fa-solid fa-play mr-1"></i> Iniciar Teste</button>`; } else if (isEmTeste) { botoes = `<button onclick="abrirModalLab(${item.linha}, '${item.serial}')" class="w-full mt-3 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg text-xs md:text-sm font-bold transition-all shadow-md"><i class="fa-solid fa-microscope mr-1"></i> Avaliar / Laudo</button>`; } else if (isFinalizado) { acaoClique = `onclick="abrirResumoLab(${index})"`; cursorHover = 'cursor-pointer'; iconeVer = `<button class="text-slate-500 hover:text-emerald-400 transition-colors w-8 h-8 flex justify-center items-center rounded-full bg-slate-900 card-neo shadow-none border-none" title="Ver Laudo"><i class="fa-solid fa-up-right-from-square"></i></button>`; } const card = `<div ${acaoClique} class="card-neo border border-slate-700 p-4 rounded-xl shadow-sm transition-all group ${cursorHover} mb-3"><div class="flex justify-between items-start mb-2"><span class="text-[9px] md:text-[10px] font-bold px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300 uppercase tracking-widest">${item.projeto}</span><div class="flex gap-2 items-center"><span class="text-[9px] md:text-[10px] font-bold text-slate-500">TK: ${item.ticket || 'N/D'}</span>${iconeVer}</div></div><p class="text-base md:text-lg font-bold text-white tracking-wide break-all">${item.serial}</p><p class="text-[10px] md:text-xs font-bold text-slate-400 truncate mb-3" title="${item.equipamento}">${item.equipamento}</p><div class="mt-2 pt-3 border-t border-slate-700/50"><span class="text-[9px] md:text-[10px] font-bold px-2 py-1 rounded border uppercase tracking-widest ${badgeCor}">${item.ocorrencia}</span></div>${botoes}</div>`; if (isPendente) { colFila.innerHTML += card; contFila++; } else if (isEmTeste) { colBancada.innerHTML += card; contBancada++; } else { colFim.innerHTML += card; contFim++; } }); document.getElementById('countLabFila').innerText = contFila; document.getElementById('countLabBancada').innerText = contBancada; document.getElementById('countLabFim').innerText = contFim; }
        async function iniciarTesteLab(linha) { const payload = { linha: linha, ocorrencia: "EM TESTE", status_reparo: "", obs: "" }; try { const res = await apiFetch('/api/lab/salvar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (res.ok) { carregarLab(); mostrarToast("Movido para a Bancada.", "sucesso");} } catch (e) { mostrarToast("Erro ao mover.", "erro"); } }
        function abrirModalLab(linha, serial) { document.getElementById('labLinhaOculta').value = linha; document.getElementById('labSerialLabel').innerText = serial; document.getElementById('labReparo').value = ""; document.getElementById('labObs').value = ""; document.getElementById('labResultadoOculto').value = ""; document.getElementById('btnLabGood').className = "py-4 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-bold text-base flex items-center justify-center gap-2"; document.getElementById('btnLabBad').className = "py-4 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 font-bold text-base flex items-center justify-center gap-2"; document.getElementById('modalLab').classList.remove('hidden'); document.getElementById('modalLab').classList.add('flex'); }
        function fecharModalLab() { document.getElementById('modalLab').classList.add('hidden'); document.getElementById('modalLab').classList.remove('flex'); }
        function selecionarResultadoLab(resultado) { document.getElementById('labResultadoOculto').value = resultado; const btnGood = document.getElementById('btnLabGood'); const btnBad = document.getElementById('btnLabBad'); if (resultado === 'OK') { btnGood.className = "py-4 rounded-xl border-2 border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold text-base transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.2)]"; btnBad.className = "py-4 rounded-xl border border-slate-700 bg-slate-800 text-slate-500 font-bold text-base transition-all flex items-center justify-center gap-2 opacity-50"; } else { btnBad.className = "py-4 rounded-xl border-2 border-red-500 bg-red-500/10 text-red-400 font-bold text-base transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.2)]"; btnGood.className = "py-4 rounded-xl border border-slate-700 bg-slate-800 text-slate-500 font-bold text-base transition-all flex items-center justify-center gap-2 opacity-50"; } }
        async function salvarLaudoLab() { const linha = document.getElementById('labLinhaOculta').value; const resultado = document.getElementById('labResultadoOculto').value; const reparo = document.getElementById('labReparo').value; const obs = document.getElementById('labObs').value; const serial = document.getElementById('labSerialLabel').innerText; if (!resultado) { mostrarToast("Selecione GOOD ou BAD.", "aviso"); return; } const hoje = new Date().toLocaleDateString('pt-BR'); const ocorrenciaComData = `${resultado} ${hoje}`; const payload = { linha: parseInt(linha), ocorrencia: ocorrenciaComData, status_reparo: reparo, obs: obs }; try { const res = await apiFetch('/api/lab/salvar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (res.ok) { fecharModalLab(); carregarLab(); mostrarToast("Laudo salvo! Enviando etiqueta...", "sucesso"); let motivo = reparo; if(obs) motivo += " - " + obs; if(!motivo) motivo = "N/A"; imprimirEtiquetaZebra(serial, resultado, motivo); } else { mostrarToast("Erro ao gravar laudo.", "erro"); } } catch (e) { mostrarToast("Erro de rede.", "erro"); } }
        function abrirResumoLab(index) { const item = labItensGlobais[index]; document.getElementById('resumoLabProj').innerText = item.projeto; document.getElementById('resumoLabTk').innerText = `TK: ${item.ticket || 'N/D'}`; document.getElementById('resumoLabSerial').innerText = item.serial; document.getElementById('resumoLabEquip').innerText = item.equipamento; const badge = document.getElementById('resumoLabOcorrencia'); badge.innerText = item.ocorrencia; if(item.ocorrencia.includes('OK')) { badge.className = 'w-fit text-xs font-bold px-4 py-2 rounded-lg border uppercase tracking-widest bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]'; } else { badge.className = 'w-fit text-xs font-bold px-4 py-2 rounded-lg border uppercase tracking-widest bg-red-500/10 border-red-500/30 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.15)]'; } document.getElementById('resumoLabReparo').innerText = item.status_reparo || 'Sem informações.'; document.getElementById('resumoLabObs').innerText = item.obs || 'Sem observações adicionais.'; const btnReimprimir = document.getElementById('btnReimprimir'); let statusPuro = item.ocorrencia.includes('OK') ? 'OK' : 'BAD'; let motivoImpressao = item.status_reparo; if(item.obs) motivoImpressao += " - " + item.obs; if(!motivoImpressao) motivoImpressao = "N/A"; btnReimprimir.onclick = () => { imprimirEtiquetaZebra(item.serial, statusPuro, motivoImpressao); }; const btnVoltar = document.getElementById('btnVoltarBancada'); btnVoltar.onclick = () => { fecharResumoLab(); iniciarTesteLab(item.linha); }; document.getElementById('modalResumoLab').classList.remove('hidden'); document.getElementById('modalResumoLab').classList.add('flex'); }
        function fecharResumoLab() { document.getElementById('modalResumoLab').classList.add('hidden'); document.getElementById('modalResumoLab').classList.remove('flex'); }

        function processarComandoIA() {
            const textoOriginal = document.getElementById('inputIA').value.trim();
            if(!textoOriginal) return mostrarToast("Digite um comando primeiro!", "aviso");
            
            const btn = document.getElementById('btnGerarIA');
            const txtBtn = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-bolt fa-fade"></i> Gerando Etiquetas...'; 
            btn.disabled = true;

            try {
                // Deixa tudo minúsculo para facilitar a busca
                const texto = textoOriginal.toLowerCase();
                
                // 1. Descobrir o TIPO da etiqueta pelo texto
                let tipo = "EXPEDICAO"; 
                let status = "OK";

                if (texto.includes('laudo') || texto.includes('teste') || texto.includes('bad') || texto.includes('good')) {
                    tipo = 'LAUDO';
                    if (texto.includes('bad') || texto.includes('ruim') || texto.includes('queim')) {
                        status = 'BAD';
                    }
                } else if (texto.includes('entrada') || texto.includes('receb')) {
                    tipo = 'ENTRADA';
                }

                // 2. Extrair dados comuns (PN, NF, Motivo)
                let pn = "N/A";
                let matchPn = texto.match(/(?:pn|modelo|equipamento|kit)\s*[:\-]*\s*([a-z0-9\s]+?)(?=\n|$|serial|seriais|nf|nota|motivo|para)/i);
                if (matchPn) pn = matchPn[1].toUpperCase().trim();

                let nf = "N/A";
                let matchNf = texto.match(/(?:nf|nota|nota fiscal)\s*[:\-]*\s*([a-z0-9]+)/i);
                if (matchNf) nf = matchNf[1].toUpperCase();

                let motivo = "N/A";
                let matchMotivo = texto.match(/(?:motivo|obs|detalhe)\s*[:\-]*\s*(.+?)(?=\n|$)/i);
                if (matchMotivo) motivo = matchMotivo[1].toUpperCase().trim();

                // 3. A Caçada por MÚLTIPLOS Seriais
                let seriais = [];
                // Procura a palavra serial e pega todo o bloco de texto depois dela até achar outra palavra-chave (nf, pn) ou acabar o texto
                let blocoSeriaisMatch = texto.match(/(?:serial|sn|s\/n|seriais)\s*[:\-]*\s*([\s\S]*?)(?:nf|nota|pn|modelo|equipamento|motivo|obs|$)/i);
                
                if (blocoSeriaisMatch) {
                    // Divide o bloco que achou por espaços, quebras de linha ou vírgulas
                    let possiveisSeriais = blocoSeriaisMatch[1].split(/[\s,;\n]+/);
                    // Filtra removendo espaços vazios ou palavras muito curtas
                    seriais = possiveisSeriais.filter(s => s.trim().length > 3).map(s => s.trim().toUpperCase());
                }

                // Se não achou nenhum serial válido, garante pelo menos um vazio para gerar a etiqueta
                if (seriais.length === 0) {
                    seriais = ["S/N"];
                }

                // 4. Montar a lista de Etiquetas (Cria uma cópia dos dados para cada serial encontrado)
                let etiquetasGeradas = [];
                seriais.forEach(serialEncontrado => {
                    etiquetasGeradas.push({
                        tipo_etiqueta: tipo,
                        projeto: "N/D",
                        serial: serialEncontrado,
                        pn: pn,
                        status: status,
                        motivo: motivo,
                        chamado: "N/D",
                        nf: nf
                    });
                });

                // 5. Manda a lista cheia para a impressora!
                setTimeout(() => {
                    imprimirEtiquetaMista(etiquetasGeradas);
                    mostrarToast(`${etiquetasGeradas.length} etiqueta(s) gerada(s)!`, "sucesso");
                    btn.innerHTML = txtBtn; 
                    btn.disabled = false;
                }, 300); 

            } catch (e) {
                console.error(e);
                mostrarToast("Erro ao interpretar o texto.", "erro");
                btn.innerHTML = txtBtn; 
                btn.disabled = false;
            }
        }

        async function processarPDFNf(input) {
            if (!input.files || input.files.length === 0) return;
            
            // Pega todos os arquivos arrastados
            const arquivos = Array.from(input.files);
            const pdfs = arquivos.filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith('.pdf'));
            
            if (pdfs.length === 0) {
                mostrarToast("Nenhum PDF válido encontrado.", "aviso");
                return;
            }

            mostrarToast(`Processando ${pdfs.length} NF(s)... aguarde.`, "sucesso");
            
            let etiquetasGeradas = [];
            let erros = 0;

            // Envia um por um para o Python bem rápido
            for (let file of pdfs) {
                const formData = new FormData();
                formData.append('file', file);
                
                try {
                    const res = await apiFetch('/api/ia/ler_nf', {
                        method: 'POST',
                        body: formData
                    });
                    const json = await res.json();
                    
                    if (res.ok && json.status === "sucesso") {
                        etiquetasGeradas.push(json.dados);
                    } else {
                        erros++;
                    }
                } catch (e) {
                    erros++;
                }
            }

            input.value = ''; // Reseta o botão

            // Se conseguiu ler pelo menos uma, manda pro layout de impressão
            if (etiquetasGeradas.length > 0) {
                mostrarToast(`Imprimindo lote de ${etiquetasGeradas.length} etiqueta(s)!`, "sucesso");
                imprimirEtiquetaMista(etiquetasGeradas);
            }
            
            if (erros > 0) {
                mostrarToast(`Falha ao ler ${erros} arquivo(s). Eles podem estar corrompidos ou em formato não reconhecido.`, "erro");
            }
        }

        function imprimirEtiquetaMista(listaDados) {
            const janelaPrint = window.open('', '', 'width=600,height=800');
            const hoje = new Date().toLocaleDateString('pt-BR');
            
            let pagesHtml = '';
            
            listaDados.forEach((dados, index) => {
                const isLaudo = dados.tipo_etiqueta === 'LAUDO'; // Verifica se foi a IA quem gerou como Laudo
                
                if (isLaudo) {
                    let statusColor = (dados.status === 'OK' || dados.status === 'GOOD') ? '#10b981' : '#ec4899';
                    let titulo = `LAUDO - ${dados.status || 'N/D'}`;
                    
                    pagesHtml += `
                    <div class="page">
                        <div class="borda-vibrante" style="background: linear-gradient(135deg, #0ea5e9, #3b82f6, #ec4899, #a855f7);">
                            <div class="etiqueta-inner">
                                <div class="header">
                                    <div class="header-logo">${FAISTON_LOGO_SVG}</div>
                                    <div class="header-info">
                                        <div class="company-name" style="font-size:24px;">FAISTON LOGÍSTICA</div>
                                        <div class="app-name">MÓDULO: LABORATÓRIO LAB</div>
                                    </div>
                                </div>
                                <div class="divider"></div>
                                <div class="status-bar" style="background-color: ${statusColor};">${titulo}</div>
                                <div class="details-grid">
                                    <div class="details-row"><span class="details-label">SERIAL NUMBER (S/N):</span><span class="details-value">${dados.serial || 'S/N'}</span></div>
                                    <div class="details-row"><span class="details-label">PART NUMBER / MODELO:</span><span class="details-value">${dados.pn || 'N/A'}</span></div>
                                    <div class="details-row"><span class="details-label">LAUDO / OBSERVAÇÕES:</span><span class="details-value">${dados.motivo || 'N/A'}</span></div>
                                </div>
                                <div class="row-split" style="justify-content: center; align-items: center; flex-direction: column;">
                                    <svg id="barcode_${index}"></svg>
                                    <div class="serial-text" style="font-size:15px; font-weight:bold; margin-top:2px;">${dados.serial || 'S/N'}</div>
                                </div>
                                <div class="footer">Sistema Giro - Assistente IA</div>
                            </div>
                        </div>
                    </div>
                    `;
                } else {
                    // Layout Expedicao / PDF
                    pagesHtml += `
                    <div class="page">
                        <div class="borda-vibrante" style="background: conic-gradient(from 180deg at 50% 50%,#3b82f6 0deg,#ec4899 90deg,#06b6d4 180deg,#ec4899 270deg,#3b82f6 360deg);">
                            <div class="etiqueta-inner">
                                <div class="header" style="text-align: center; border-bottom: 2px dashed #ccc; padding-bottom: 10px; margin-bottom: 10px;">
                                    <h1 style="margin: 0; font-size: 24px; font-weight: 900; letter-spacing: 1px; color: #111;">FAISTON LOGÍSTICA</h1>
                                    <p style="margin: 4px 0 0 0; font-size: 10px; font-weight: bold; color: #666;">EMISSÃO: ${hoje}</p>
                                </div>
                                <div class="status-bar" style="background-color: #8b5cf6;">ETIQUETA DE ENVIO</div>
                                
                                <div class="details-grid">
                                    <div class="details-row">
                                        <span class="details-label">DESTINATÁRIO</span>
                                        <span class="details-value" style="font-size: 18px;">${dados.destinatario || 'VERIFICAR NO PDF'}</span>
                                    </div>
                                    <div class="details-row">
                                        <span class="details-label">ENDEREÇO DE ENTREGA</span>
                                        <span class="details-value">${dados.endereco || 'VERIFICAR NO PDF'}</span>
                                    </div>
                                    <div class="details-row">
                                        <span class="details-label">REMETENTE</span>
                                        <span class="details-value">${dados.remetente || 'FAISTON LOGÍSTICA'}</span>
                                    </div>
                                    <div class="details-row">
                                        <span class="details-label">CONTATO / FONE</span>
                                        <span class="details-value">${dados.contato || 'N/A'}</span>
                                    </div>
                                </div>

                                <div class="row-split">
                                    <div class="details-row" style="border:none; flex:1; min-width:0;">
                                        <span class="details-label">NOTA FISCAL</span>
                                        <span class="nf-num" data-nf="${dados.nf || 'N/A'}">${dados.nf || 'N/A'}</span>
                                    </div>
                                    <div class="details-row" style="border:none; text-align:right; flex-shrink:0;">
                                        <span class="details-label">VOLUMES</span>
                                        <span class="details-value">${String(dados.volumes || '1').trim()} VOL</span>
                                    </div>
                                </div>
                                
                                <div class="footer">Sistema Giro - Extração Automatizada de Lote</div>
                            </div>
                        </div>
                    </div>
                    `;
                }
            });

            const htmlFull = `<!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Lote de Etiquetas</title>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
                <style>
                    @page { margin: 0; size: 100mm 150mm; }
                    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: white; }
                    .page { width: 100mm; height: 145mm; display: flex; justify-content: center; align-items: center; box-sizing: border-box; page-break-after: always; padding: 6px; }
                    .page:last-child { page-break-after: auto; }
                    .borda-vibrante { width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; box-sizing: border-box; border-radius: 4px; padding: 4px; }
                    .etiqueta-inner { width: 100%; height: 100%; display: flex; flex-direction: column; padding: 15px; box-sizing: border-box; background-color: white; border-radius: 2px;}
                    .header { display: flex; align-items: center; gap: 15px; width: 100%; }
                    .header-logo { width: 55px; height: 55px; background-color: black; border-radius: 12px; display: flex; justify-content: center; align-items: center; padding: 5px; flex-shrink: 0; }
                    .header-info { display: flex; flex-direction: column; justify-content: center; }
                    .company-name { font-size: 26px; font-weight: 900; line-height: 1.1; color: #111; letter-spacing: 0.5px; }
                    .app-name { font-size: 11px; font-weight: bold; color: #666; margin-top: 4px; letter-spacing: 0.5px; }
                    .divider { width: 100%; border-bottom: 2px dashed #ccc; margin: 15px 0; }
                    .status-bar { width: 100%; color: white; text-align: center; padding: 10px 0; border-radius: 8px; margin-bottom: 12px; font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;}
                    .details-grid { display: flex; flex-direction: column; gap: 12px; flex: 1; }
                    .details-row { display: flex; flex-direction: column; border-bottom: 1px solid #eee; padding-bottom: 6px; }
                    .details-label { font-size: 10px; font-weight: bold; color: #777; text-transform: uppercase; margin-bottom: 2px; }
                    .details-value { font-size: 14px; font-weight: 900; color: black; word-wrap: break-word; }
                    .nf-num { font-weight: 900; color: black; line-height: 1; white-space: nowrap; display: block; }
                    .row-split { display: flex; justify-content: space-between; align-items: flex-end; border-top: 2px dashed #ccc; padding-top: 10px; margin-top: auto; gap: 8px; }
                    .row-split > div { min-width: 0; }
                    .footer { text-align: center; font-size: 9px; color: #999; margin-top: 10px; padding-top: 5px; border-top: 1px dashed #eee; font-weight: bold; }
                    @media print { .borda-vibrante, .status-bar, .header-logo { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
                </style>
            </head>
            <body>
                ${pagesHtml}
                <script>
                    // Ajusta o tamanho da fonte do numero da NF baseado na quantidade de digitos
                    document.querySelectorAll('.nf-num').forEach(function(el) {
                        var nf = el.getAttribute('data-nf') || el.textContent;
                        var len = nf.replace(/\\D/g, '').length;
                        var size = len <= 4 ? 64 : len <= 6 ? 52 : len <= 8 ? 40 : 30;
                        el.style.fontSize = size + 'px';
                    });
                    
                    // Gera codigos de barra apenas nas notas que forem de LAUDO
                    ${listaDados.map((d, i) => d.tipo_etiqueta === 'LAUDO' ? `if(document.getElementById('barcode_${i}')) JsBarcode("#barcode_${i}", "${d.serial || 'S/N'}", {format: "CODE128", width: 2.2, height: 60, displayValue: false, margin: 0});` : '').join('\n')}
                    
                    setTimeout(() => { 
                        window.print(); 
                        window.onafterprint = function() { window.close(); }; 
                    }, 1000);
                <\/script>
            </body>
            </html>`;
            
            janelaPrint.document.write(htmlFull);
            janelaPrint.document.close();
        }
        // --- FUNÇÃO PARA IMPRIMIR LAUDOS DO LABORATÓRIO (ZEBRA) ---
        function imprimirEtiquetaZebra(serial, status, motivo) {
            const janelaPrint = window.open('', '', 'width=600,height=800');
            
            // Define a cor com base no status (Verde para OK, Rosa/Vermelho para BAD)
            let statusColor = (status === 'OK' || status === 'GOOD') ? '#10b981' : '#ec4899';
            let titulo = `LAUDO - ${status}`;
            
            let detalhes = `
                <div class="details-row"><span class="details-label">SERIAL NUMBER (S/N):</span><span class="details-value">${serial || 'S/N'}</span></div>
                <div class="details-row"><span class="details-label">LAUDO / OBSERVAÇÕES:</span><span class="details-value">${motivo || 'N/A'}</span></div>
            `;

            let bodyContent = `
            <div class="page">
                <div class="borda-vibrante">
                    <div class="etiqueta-inner">
                        <div class="header">
                            <div class="header-logo">${FAISTON_LOGO_SVG}</div>
                            <div class="header-info">
                                <div class="company-name">FAISTON<br>LOGÍSTICA</div>
                                <div class="app-name">MÓDULO: LABORATÓRIO LAB</div>
                            </div>
                        </div>
                        <div class="divider"></div>
                        <div class="status-bar" style="background-color: ${statusColor};"><div class="status-text">${titulo}</div></div>
                        <div class="details-grid">${detalhes}</div>
                        <div class="divider"></div>
                        <div class="barcode-container">
                            <svg id="barcode_lab"></svg>
                            <div class="serial-text">${serial || 'S/N'}</div>
                        </div>
                        <div class="footer">Sistema Giro - Controle Logístico</div>
                    </div>
                </div>
            </div>
            `;

            const htmlFull = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Impressão Laudo</title>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
            <style>
                @page { margin: 0; size: 100mm 150mm; }
                body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: white; }
                .page { width: 100mm; height: 145mm; display: flex; justify-content: center; align-items: center; box-sizing: border-box; page-break-after: always; padding: 6px; }
                .borda-vibrante { width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; box-sizing: border-box; background: linear-gradient(135deg, #0ea5e9, #3b82f6, #ec4899, #a855f7); border-radius: 4px; padding: 4px; }
                .etiqueta-inner { width: 100%; height: 100%; display: flex; flex-direction: column; padding: 20px; box-sizing: border-box; background-color: white; border-radius: 2px; }
                .header { display: flex; align-items: center; gap: 15px; width: 100%; }
                .header-logo { width: 55px; height: 55px; background-color: black; border-radius: 12px; display: flex; justify-content: center; align-items: center; padding: 5px; flex-shrink: 0; }
                .header-info { display: flex; flex-direction: column; justify-content: center; }
                .company-name { font-size: 26px; font-weight: 900; line-height: 1.1; color: #111; letter-spacing: 0.5px; }
                .app-name { font-size: 11px; font-weight: bold; color: #666; margin-top: 4px; letter-spacing: 0.5px; }
                .divider { width: 100%; border-bottom: 2px dashed #ccc; margin: 15px 0; }
                .status-bar { width: 100%; color: white; text-align: center; padding: 12px 0; border-radius: 8px; margin-bottom: 12px;}
                .status-text { font-size: 24px; font-weight: 900; letter-spacing: 1px; }
                .details-grid { display: flex; flex-direction: column; gap: 14px; width: 100%; flex: 1;}
                .details-row { display: flex; flex-direction: column; }
                .details-label { font-size: 11px; font-weight: 800; color: #777; margin-bottom: 2px; }
                .details-value { font-size: 18px; font-weight: 900; color: #111; letter-spacing: 0.5px;}
                .barcode-container { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; }
                .barcode-container svg { max-width: 100%; }
                .serial-text { font-size: 15px; font-weight: bold; color: #111; margin-top: 2px; }
                .footer { text-align: center; font-size: 9px; font-weight: bold; color: #aaa; margin-top: auto; }
                @media print { .borda-vibrante, .status-bar, .header-logo { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
            </style></head><body>${bodyContent}
            <script>
                // Gera o código de barras
                JsBarcode("#barcode_lab", "${serial || 'S/N'}", {format: "CODE128", width: 2.2, height: 60, displayValue: false, margin: 0});
                
                // Abre a tela de impressão e fecha a janela invisível logo em seguida
                setTimeout(()=>{
                    window.print();
                    window.onafterprint=function(){window.close();};
                }, 800);
            <\/script></body></html>`;
            
            janelaPrint.document.write(htmlFull);
            janelaPrint.document.close();
        }

        // ==========================================
        // IMPRESSÃO DE ETIQUETA DE ENTRADA (RECEBIMENTO)
        // ==========================================
        function imprimirEtiquetaEntrada(index, chamado, tipo, rastreio, projeto) {
            // Pega o serial que o usuário digitou no campo (ou usa S/N se estiver vazio)
            const inputSerial = document.getElementById('serial_' + index);
            const serial = inputSerial && inputSerial.value.trim() ? inputSerial.value.trim() : 'S/N';
            
            const janelaPrint = window.open('', '', 'width=600,height=800');
            const hoje = new Date().toLocaleDateString('pt-BR');
            
            const htmlFull = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Etiqueta de Entrada</title>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
            <style>
                @page { margin: 0; size: 100mm 150mm; }
                body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: white; }
                .page { width: 100mm; height: 145mm; display: flex; justify-content: center; align-items: center; box-sizing: border-box; padding: 6px; }
                .borda-vibrante { width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; box-sizing: border-box; background: linear-gradient(135deg, #4f46e5, #8b5cf6); border-radius: 4px; padding: 4px; }
                .etiqueta-inner { width: 100%; height: 100%; display: flex; flex-direction: column; padding: 20px; box-sizing: border-box; background-color: white; border-radius: 2px; }
                .header { display: flex; align-items: center; gap: 15px; width: 100%; }
                .header-logo { width: 55px; height: 55px; background-color: black; border-radius: 12px; display: flex; justify-content: center; align-items: center; padding: 5px; flex-shrink: 0; }
                .header-info { display: flex; flex-direction: column; justify-content: center; }
                .company-name { font-size: 26px; font-weight: 900; line-height: 1.1; color: #111; letter-spacing: 0.5px; }
                .app-name { font-size: 11px; font-weight: bold; color: #666; margin-top: 4px; letter-spacing: 0.5px; }
                .divider { width: 100%; border-bottom: 2px dashed #ccc; margin: 15px 0; }
                .status-bar { width: 100%; color: white; text-align: center; padding: 12px 0; border-radius: 8px; margin-bottom: 12px; background-color: #4f46e5;}
                .status-text { font-size: 24px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;}
                .details-grid { display: flex; flex-direction: column; gap: 14px; width: 100%; flex: 1;}
                .details-row { display: flex; flex-direction: column; }
                .details-label { font-size: 11px; font-weight: 800; color: #777; margin-bottom: 2px; }
                .details-value { font-size: 16px; font-weight: 900; color: #111; letter-spacing: 0.5px;}
                .barcode-container { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; }
                .barcode-container svg { max-width: 100%; }
                .serial-text { font-size: 15px; font-weight: bold; color: #111; margin-top: 2px; }
                .footer { text-align: center; font-size: 9px; font-weight: bold; color: #aaa; margin-top: auto; }
                @media print { .borda-vibrante, .status-bar, .header-logo { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
            </style></head><body>
            <div class="page">
                <div class="borda-vibrante">
                    <div class="etiqueta-inner">
                        <div class="header">
                            <div class="header-logo">${FAISTON_LOGO_SVG}</div>
                            <div class="header-info">
                                <div class="company-name">FAISTON<br>LOGÍSTICA</div>
                                <div class="app-name">DATA: ${hoje}</div>
                            </div>
                        </div>
                        <div class="divider"></div>
                        <div class="status-bar"><div class="status-text">RECEBIMENTO</div></div>
                        <div class="details-grid">
                            <div class="details-row"><span class="details-label">PROJETO:</span><span class="details-value">${projeto}</span></div>
                            <div class="details-row"><span class="details-label">MODELO / TIPO:</span><span class="details-value">${tipo}</span></div>
                            <div class="details-row"><span class="details-label">CHAMADO / TICKET:</span><span class="details-value">${chamado}</span></div>
                        </div>
                        <div class="divider"></div>
                        <div class="barcode-container">
                            <svg id="barcode_entrada"></svg>
                            <div class="serial-text">S/N: ${serial}</div>
                        </div>
                        <div class="footer">Sistema Giro - Recepção de Equipamentos</div>
                    </div>
                </div>
            </div>
            <script>
                JsBarcode("#barcode_entrada", "${serial}", {format: "CODE128", width: 2.2, height: 60, displayValue: false, margin: 0});
                setTimeout(()=>{ window.print(); window.onafterprint=function(){window.close();}; }, 800);
            <\/script></body></html>`;
            
            janelaPrint.document.write(htmlFull);
            janelaPrint.document.close();
        }

        function abrirModalUsuario() {
            document.getElementById('modalNovoUsuario').classList.remove('hidden');
            document.getElementById('modalNovoUsuario').classList.add('flex');
        }
        
        function fecharModalUsuario() {
            document.getElementById('modalNovoUsuario').classList.add('hidden');
            document.getElementById('modalNovoUsuario').classList.remove('flex');
        }

        async function salvarNovoUsuario() {
            const user = document.getElementById('cadUser').value.trim();
            const nome = document.getElementById('cadNome').value.trim();
            const pass = document.getElementById('cadPass').value.trim();
            const perfil = document.getElementById('cadPerfil').value;

            if(!user || !nome || !pass) return mostrarToast("Preencha todos os campos!", "aviso");

            try {
                const res = await apiFetch('/api/usuarios', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({usuario: user, nome: nome, senha: pass, perfil: perfil})
                });
                
                const json = await res.json();
                
                if(res.ok) {
                    mostrarToast(json.mensagem, "sucesso");
                    fecharModalUsuario();
                    // Limpa os campos para o próximo cadastro
                    document.getElementById('cadUser').value = '';
                    document.getElementById('cadNome').value = '';
                    document.getElementById('cadPass').value = '';
                } else {
                    mostrarToast(json.detail, "erro");
                }
            } catch(e) {
                mostrarToast("Erro de rede ao criar usuário.", "erro");
            }
        }
        // ==========================================
        // LÓGICA DO ARRASTAR E SOLTAR (DRAG AND DROP)
        // ==========================================
        const dropZone = document.getElementById('dropZonePdf');

        if (dropZone) {
            // Quando o arquivo está passando por cima (efeito visual)
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.remove('border-emerald-500/40', 'bg-emerald-500/5');
                dropZone.classList.add('border-emerald-400', 'bg-emerald-500/20', 'scale-[1.02]');
            });

            // Quando o mouse sai de cima sem soltar
            dropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                dropZone.classList.add('border-emerald-500/40', 'bg-emerald-500/5');
                dropZone.classList.remove('border-emerald-400', 'bg-emerald-500/20', 'scale-[1.02]');
            });

            // Quando o usuário finalmente SOLTA os arquivos
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                // Volta o visual ao normal
                dropZone.classList.add('border-emerald-500/40', 'bg-emerald-500/5');
                dropZone.classList.remove('border-emerald-400', 'bg-emerald-500/20', 'scale-[1.02]');
                
                // Pega os arquivos arrastados e manda direto pra função do Python
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    processarPDFNf({ files: e.dataTransfer.files }); 
                }
            });
        } // <--- A CHAVE MÁGICA QUE FALTAVA ESTÁ AQUI!

        // ==========================================
        // TELA DE GESTÃO DE USUÁRIOS
        // ==========================================
        async function carregarListaUsuarios() {
            const grid = document.getElementById('gridUsuarios');
            const loader = document.getElementById('loadingUsuarios');
            
            if(!grid || !loader) return; // Proteção extra
            
            grid.innerHTML = '';
            loader.classList.remove('hidden');
            loader.classList.add('flex');

            try {
                const res = await apiFetch('/api/usuarios');
                const json = await res.json();

                if (res.ok) {
                    json.dados.forEach(u => {
                        let corPerfil = u.perfil === 'ADMIN' ? 'text-pink-400 bg-pink-400/10 border-pink-500/20' : (u.perfil === 'LOGISTICA' ? 'text-sky-400 bg-sky-400/10 border-sky-500/20' : 'text-indigo-400 bg-indigo-400/10 border-indigo-500/20');
                        let iconePerfil = u.perfil === 'ADMIN' ? 'fa-user-shield' : (u.perfil === 'LOGISTICA' ? 'fa-truck-fast' : 'fa-microchip');
                        
                        let btnDelete = u.usuario === 'rafael' 
                            ? `<span class="text-[10px] text-slate-500 font-bold px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800"><i class="fa-solid fa-lock"></i> MASTER</span>` 
                            : `<button onclick="deletarUsuario('${u.usuario}')" class="text-slate-400 hover:text-red-400 bg-slate-900 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/30 px-3 py-1.5 rounded-lg transition-all text-sm" title="Excluir Usuário"><i class="fa-solid fa-trash"></i></button>`;

                        grid.innerHTML += `
                        <div class="card-neo p-5 rounded-2xl flex flex-col gap-4">
                            <div class="flex justify-between items-start">
                                <div class="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 text-xl shrink-0">
                                    <i class="fa-solid fa-user"></i>
                                </div>
                                ${btnDelete}
                            </div>
                            <div>
                                <h3 class="text-lg font-bold text-white tracking-tight">${u.nome}</h3>
                                <p class="text-sm text-slate-400 font-medium mt-0.5">@${u.usuario}</p>
                            </div>
                            <div class="mt-auto pt-4 border-t border-slate-700/50">
                                <span class="text-[10px] font-bold px-2.5 py-1 rounded border uppercase tracking-widest ${corPerfil} flex items-center gap-1.5 w-fit">
                                    <i class="fa-solid ${iconePerfil}"></i> ${u.perfil}
                                </span>
                            </div>
                        </div>`;
                    });
                } else {
                    mostrarToast("Aviso: " + json.detail, "erro");
                }
            } catch (e) {
                mostrarToast("Falha na comunicação com o servidor.", "erro");
            } finally {
                loader.classList.add('hidden');
                loader.classList.remove('flex');
            }
        }

        async function deletarUsuario(usuario) {
            if (!confirm(`⚠️ Tem a certeza que deseja excluir o utilizador @${usuario}? Ele perderá o acesso imediatamente.`)) return;
            
            try {
                const res = await apiFetch(`/api/usuarios/${usuario}`, { method: 'DELETE' });
                const json = await res.json();
                
                if (res.ok) {
                    mostrarToast(json.mensagem, "sucesso");
                    carregarListaUsuarios(); 
                } else {
                    mostrarToast(json.detail, "erro");
                }
            } catch(e) {
                mostrarToast("Erro de rede ao excluir.", "erro");
            }
        }