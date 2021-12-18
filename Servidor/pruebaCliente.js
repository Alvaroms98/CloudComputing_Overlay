const zmq = require('zeromq');
 
// socket cliente del servidor
socketReq = zmq.socket('req');
socketReq.connect(`tcp://localhost:8081`);


// socket subscriptor
socketSub = zmq.socket('sub');
socketSub.connect(`tcp://localhost:8080`);
socketSub.subscribe('deamon');

socketSub.on('message', (tema,mensaje) => {
    console.log(`Publicación del servidor en el tema ${tema.toString()}: ${mensaje.toString()}`);
});

socketReq.on('message', (mensaje) => {
    console.log(`Respuesta del servidor: ${mensaje.toString()}`);
});

socketReq.send(['prueba','Hola desde el cliente']);

process.on('SIGINT', () =>{
socketReq.close();
socketSub.close();
});