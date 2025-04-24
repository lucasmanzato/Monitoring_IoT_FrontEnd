document.addEventListener('DOMContentLoaded', function() {
    // 1. CONFIGURAÇÃO DA CONEXÃO
    const SERVER_IP = '10.79.12.142'; // IP da máquina com o back-end
    const WS_URL = `http://${SERVER_IP}:8080/iot-websocket`; // Note o HTTP aqui
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
        if (!element && key !== 'serverIpDisplay') {
            console.error(`Elemento não encontrado: ${key}`);
            return;
        }
    }

    if (elements.serverIpDisplay) {
        elements.serverIpDisplay.textContent = `Conectando ao servidor: ${SERVER_IP}`;
    }

    // 3. CONFIGURAÇÃO DO GRÁFICO
    let windChart = null;
    
    function initChart() {
        try {
            if (windChart) windChart.destroy();
            
            const ctx = elements.canvas.getContext('2d');
            windChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Velocidade (km/h)',
                            data: [],
                            borderColor: 'rgba(75, 192, 192, 1)',
                            backgroundColor: 'rgba(75, 192, 192, 0.2)',
                            tension: 0.1
                        },
                        {
                            label: 'Direção (°)',
                            data: [],
                            borderColor: 'rgba(153, 102, 255, 1)',
                            backgroundColor: 'rgba(153, 102, 255, 0.2)',
                            tension: 0.1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    animation: { duration: 1000 },
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y: { type: 'linear', position: 'left', title: { display: true, text: 'Velocidade (km/h)' }},
                        y1: { type: 'linear', position: 'right', title: { display: true, text: 'Direção (°)' }, min: 0, max: 360 }
                    }
                }
            });
            return true;
        } catch (error) {
            console.error('Erro ao inicializar gráfico:', error);
            return false;
        }
    }

    // 4. CONEXÃO WEBSOCKET (CORRIGIDA)
    function connect() {
        console.log(`Tentando conectar em: ${WS_URL}`);
        
        try {
            // Usando SockJS diretamente com HTTP
            const socket = new SockJS(WS_URL);
            const stompClient = Stomp.over(socket);
            
            // Configuração importante para ambientes de desenvolvimento
            stompClient.reconnect_delay = 5000;
            stompClient.debug = null; // Desativa logs verbosos
            
            stompClient.connect({}, function(frame) {
                console.log('Conectado com sucesso!');
                updateConnectionStatus(true);
                
                stompClient.subscribe(TOPIC, function(message) {
                    try {
                        const data = JSON.parse(message.body);
                        updateUI(data);
                        updateChart(data);
                        addToHistory(data);
                    } catch (error) {
                        console.error('Erro ao processar mensagem:', error);
                    }
                });
            }, function(error) {
                console.error('Erro de conexão:', error);
                updateConnectionStatus(false);
                setTimeout(connect, 5000);
            });
        } catch (error) {
            console.error('Erro na inicialização:', error);
            setTimeout(connect, 5000);
        }
    }

    // Atualizar status da conexão
    function updateConnectionStatus(connected) {
        if (connected) {
            elements.connectionStatus.textContent = 'Conectado';
            elements.connectionStatus.classList.remove('disconnected');
            elements.connectionStatus.classList.add('connected');
            if (elements.serverIpDisplay) {
                elements.serverIpDisplay.textContent = `Conectado ao servidor: ${SERVER_IP}`;
            }
        } else {
            elements.connectionStatus.textContent = 'Desconectado';
            elements.connectionStatus.classList.remove('connected');
            elements.connectionStatus.classList.add('disconnected');
            if (elements.serverIpDisplay) {
                elements.serverIpDisplay.textContent = `Tentando conectar ao servidor: ${SERVER_IP}`;
            }
        }
    }

    // Atualizar a interface com novos dados
    function updateUI(data) {
        try {
            elements.windSpeed.textContent = data.speed.toFixed(1);
            elements.windDirection.textContent = Math.round(data.direction);
            elements.directionArrow.style.transform = `rotate(${data.direction}deg)`;
        } catch (error) {
            console.error('Erro ao atualizar UI:', error);
        }
    }

    // Atualizar o gráfico
    function updateChart(data) {
        try {
            // Adicionar novos dados
            speedHistory.push(data.speed);
            directionHistory.push(data.direction);
            
            // Criar rótulo de tempo
            const now = new Date();
            const timeString = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
            timeLabels.push(timeString);
            
            // Limitar histórico
            if (speedHistory.length > MAX_HISTORY) {
                speedHistory.shift();
                directionHistory.shift();
                timeLabels.shift();
            }
            
            // Atualizar gráfico
            windChart.data.labels = timeLabels;
            windChart.data.datasets[0].data = speedHistory;
            windChart.data.datasets[1].data = directionHistory;
            windChart.update();
        } catch (error) {
            console.error('Erro ao atualizar gráfico:', error);
            if (initChart()) { // Reinicializar gráfico se possível
                updateChart(data); // Tentar novamente
            }
        }
    }

    // Adicionar ao histórico de atualizações
    function addToHistory(data) {
        try {
            const now = new Date();
            const updateItem = document.createElement('div');
            updateItem.className = 'update-item';
            updateItem.textContent = `${now.toLocaleTimeString()} - Vel: ${data.speed.toFixed(1)} km/h, Dir: ${Math.round(data.direction)}°`;
            
            elements.updatesList.insertBefore(updateItem, elements.updatesList.firstChild);
            
            // Limitar histórico
            if (elements.updatesList.children.length > 10) {
                elements.updatesList.removeChild(elements.updatesList.lastChild);
            }
        } catch (error) {
            console.error('Erro ao adicionar histórico:', error);
        }
    }

    if (initChart()) {
        connect();
    }else {
        console.error('Não foi possível inicializar o gráfico');
    }
});