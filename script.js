document.addEventListener('DOMContentLoaded', function() {
    // 1. CONFIGURAÇÃO DA CONEXÃO
    const SERVER_IP = '192.168.1.21'; // IP da máquina com o back-end
    const WS_URL = `http://${SERVER_IP}:8080/iot-websocket`;
    const TOPIC = '/topic/wind_updates';

    // 2. ELEMENTOS DA UI
    const elements = {
        connectionStatus: document.getElementById('connection-status'),
        windSpeed: document.getElementById('wind-speed'),
        windDirection: document.getElementById('wind-direction'),
        directionArrow: document.getElementById('direction-arrow'),
        updatesList: document.getElementById('updates-list'),
        canvas: document.getElementById('windChart'),
        serverIpDisplay: document.getElementById('server-ip')
    };

    // Verificação dos elementos
    for (const [key, element] of Object.entries(elements)) {
        if (!element && key !== 'serverIpDisplay') { // serverIpDisplay é opcional para a funcionalidade principal
            console.error(`Elemento da UI não encontrado: ${key}. Verifique o HTML.`);
            // Poderia desabilitar funcionalidades ou mostrar um erro mais visível ao usuário aqui.
            // Por agora, apenas logamos o erro e tentamos continuar se possível.
            if (key === 'canvas') { // Se o canvas não existe, não adianta prosseguir com o gráfico
                 alert("Erro crítico: Elemento 'windChart' (canvas) não encontrado. O gráfico não funcionará.");
                 return;
            }
        }
    }

    if (elements.serverIpDisplay) {
        elements.serverIpDisplay.textContent = `Tentando conectar ao servidor: ${SERVER_IP}`;
    }

    // 3. DADOS E CONFIGURAÇÃO DO GRÁFICO
    let windChart = null;
    const MAX_HISTORY = 20; // Número máximo de pontos de dados no gráfico
    let speedHistory = [];
    let directionHistory = [];
    let timeLabels = [];

    function initChart() {
        if (!elements.canvas) {
            console.error("Canvas do gráfico não encontrado. Não é possível inicializar o gráfico.");
            return false;
        }
        try {
            if (windChart) {
                windChart.destroy();
            }
            
            const ctx = elements.canvas.getContext('2d');
            windChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: timeLabels, // Inicializa com os arrays (vazios no começo)
                    datasets: [
                        {
                            label: 'Velocidade (km/h)',
                            data: speedHistory, // Inicializa com os arrays
                            borderColor: 'rgba(75, 192, 192, 1)',
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            tension: 0.1,
                            yAxisID: 'y' // Associa ao eixo y da velocidade
                        },
                        {
                            label: 'Direção (°)',
                            data: directionHistory, // Inicializa com os arrays
                            borderColor: 'rgba(153, 102, 255, 1)',
                            backgroundColor: 'rgba(153, 102, 255, 0.2)',
                            tension: 0.1,
                            yAxisID: 'y1' // Associa ao eixo y1 da direção
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 500 }, // Reduzido para updates mais rápidos se desejado
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        x: {
                            title: { display: true, text: 'Tempo' }
                        },
                        y: { // Eixo para Velocidade
                            type: 'linear',
                            position: 'left',
                            title: { display: true, text: 'Velocidade (km/h)' },
                            suggestedMin: 0,
                            suggestedMax: 60 // Ajustado para a faixa esperada de velocidade (10-50)
                        },
                        y1: { // Eixo para Direção
                            type: 'linear',
                            position: 'right',
                            title: { display: true, text: 'Direção (°)' },
                            min: 0,
                            max: 360,
                            grid: { // Para não sobrepor a grade do eixo Y principal
                                drawOnChartArea: false,
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                        }
                    }
                }
            });
            console.log("Gráfico inicializado com sucesso.");
            return true;
        } catch (error) {
            console.error('Erro ao inicializar gráfico:', error);
            if (elements.canvas) {
                elements.canvas.innerHTML = "Erro ao carregar o gráfico. Verifique o console.";
            }
            return false;
        }
    }

    // 4. CONEXÃO WEBSOCKET
    function connect() {
        if (!window.SockJS || !window.Stomp) {
            console.error("SockJS ou StompJS não carregados. Verifique as tags <script>.");
            updateConnectionStatus(false, "Erro de dependência");
            if (elements.serverIpDisplay) elements.serverIpDisplay.textContent = "Erro: Bibliotecas SockJS/StompJS não encontradas.";
            return;
        }

        console.log(`Tentando conectar em: ${WS_URL}`);
        if (elements.serverIpDisplay) elements.serverIpDisplay.textContent = `Tentando conectar ao servidor: ${SERVER_IP}...`;
        
        try {
            const socket = new SockJS(WS_URL);
            const stompClient = Stomp.over(socket);
            
            stompClient.reconnect_delay = 5000;
            stompClient.debug = (str) => { /* console.log(str); */ }; // Desativa logs verbosos do Stomp, descomente para depurar
            
            stompClient.connect({}, function(frame) {
                console.log('Conectado via WebSocket: ' + frame);
                updateConnectionStatus(true);
                
                stompClient.subscribe(TOPIC, function(message) {
                    try {
                        const data = JSON.parse(message.body);
                        // console.log("Dados recebidos:", data); // Para depuração
                        if (typeof data.speed !== 'number' || typeof data.direction !== 'number') {
                            console.warn("Dados recebidos em formato inesperado:", data);
                            return;
                        }
                        updateUI(data);
                        updateChart(data);
                        addToHistory(data);
                    } catch (error) {
                        console.error('Erro ao processar mensagem WebSocket:', error, "Mensagem:", message.body);
                    }
                });
            }, function(error) {
                console.error('Erro de conexão WebSocket:', error);
                updateConnectionStatus(false, error.toString());
                setTimeout(connect, 5000); // Tenta reconectar após 5 segundos
            });

            // Lidar com erros de fechamento do socket SockJS
            socket.onclose = function(e) {
                console.warn('Socket SockJS fechado:', e);
                updateConnectionStatus(false, "Socket fechado");
                // A lógica de reconexão do Stomp.js deve cuidar disso, mas podemos adicionar um timeout aqui se necessário
                // setTimeout(connect, 5000); // Redundante se o Stomp já faz, mas pode ser uma segurança
            };

        } catch (error) {
            console.error('Erro na inicialização da conexão WebSocket:', error);
            updateConnectionStatus(false, "Erro de inicialização");
            setTimeout(connect, 5000);
        }
    }

    // Atualizar status da conexão na UI
    function updateConnectionStatus(connected, message = "") {
        if (!elements.connectionStatus) return;
        if (connected) {
            elements.connectionStatus.textContent = 'Conectado';
            elements.connectionStatus.className = 'connected'; // Remove todas as classes e adiciona 'connected'
            if (elements.serverIpDisplay) {
                elements.serverIpDisplay.textContent = `Conectado ao servidor: ${SERVER_IP}`;
            }
        } else {
            elements.connectionStatus.textContent = `Desconectado ${message ? '('+message+')' : ''}`;
            elements.connectionStatus.className = 'disconnected'; // Remove todas as classes e adiciona 'disconnected'
            if (elements.serverIpDisplay) {
                elements.serverIpDisplay.textContent = `Tentando conectar ao servidor: ${SERVER_IP}... ${message}`;
            }
        }
    }

    // Atualizar a interface (cards de dados)
    function updateUI(data) {
        try {
            if(elements.windSpeed) elements.windSpeed.textContent = data.speed.toFixed(1);
            if(elements.windDirection) elements.windDirection.textContent = Math.round(data.direction);
            if(elements.directionArrow) elements.directionArrow.style.transform = `rotate(${data.direction}deg)`;
        } catch (error) {
            console.error('Erro ao atualizar UI (cards):', error, "Dados:", data);
        }
    }

    // Atualizar o gráfico
    function updateChart(data) {
        if (!windChart || !windChart.data) { // Verifica se o gráfico e seus dados existem
            console.warn("Gráfico não inicializado ou dados do gráfico ausentes. Tentando reinicializar.");
            if(initChart()) { // Tenta reinicializar
                 // Se reinicializado, os arrays de histórico já estarão vazios, então adicionamos o dado atual.
            } else {
                console.error("Falha ao reinicializar o gráfico. Novas atualizações podem não ser exibidas.");
                return; // Não pode prosseguir se o gráfico não puder ser inicializado/reinicializado
            }
        }

        try {
            const now = new Date();
            const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
            
            // Adicionar novos dados aos arrays de histórico
            timeLabels.push(timeString);
            speedHistory.push(data.speed);
            directionHistory.push(data.direction);
            
            // Limitar o tamanho do histórico
            if (timeLabels.length > MAX_HISTORY) {
                timeLabels.shift();
                speedHistory.shift();
                directionHistory.shift();
            }
            
            // Atualizar os dados do gráfico diretamente
            windChart.data.labels = timeLabels;
            windChart.data.datasets[0].data = speedHistory;
            windChart.data.datasets[1].data = directionHistory;
            
            windChart.update();
        } catch (error) {
            console.error('Erro ao atualizar dados do gráfico:', error, "Dados:", data);
            // Em caso de erro aqui, pode ser útil tentar reinicializar o gráfico na próxima atualização
            // ou logar o estado dos arrays de histórico.
        }
    }

    // Adicionar ao histórico de atualizações na lista da UI
    function addToHistory(data) {
        if (!elements.updatesList) return;
        try {
            const now = new Date();
            const updateItem = document.createElement('div');
            updateItem.className = 'update-item';
            updateItem.textContent = `${now.toLocaleTimeString()} - Vel: ${data.speed.toFixed(1)} km/h, Dir: ${Math.round(data.direction)}°`;
            
            elements.updatesList.insertBefore(updateItem, elements.updatesList.firstChild);
            
            if (elements.updatesList.children.length > 10) { // Limita a 10 itens na lista
                elements.updatesList.removeChild(elements.updatesList.lastChild);
            }
        } catch (error) {
            console.error('Erro ao adicionar ao histórico da UI:', error, "Dados:", data);
        }
    }

    // Inicialização
    if (initChart()) { // Tenta inicializar o gráfico primeiro
        connect(); // Se o gráfico for inicializado com sucesso, tenta conectar
    } else {
        // Se o gráfico não puder ser inicializado, uma mensagem de erro já foi logada por initChart().
        // Poderíamos mostrar uma mensagem mais proeminente para o usuário aqui se desejado.
        if (elements.connectionStatus) { // Mostra um status de erro se o gráfico falhar
            elements.connectionStatus.textContent = 'Erro crítico: Gráfico não pôde ser carregado.';
            elements.connectionStatus.className = 'disconnected';
        }
        if (elements.serverIpDisplay) {
            elements.serverIpDisplay.textContent = "Falha ao inicializar o gráfico. A aplicação pode não funcionar corretamente."
        }
        // Poderia-se optar por não tentar conectar via WebSocket se o gráfico (componente principal) falhar.
        // connect(); // Ou comentar esta linha se o gráfico for essencial.
    }
});