const zmq = require('zeromq');

const socketReq = zmq.socket('req');
socketReq.connect('tcp://localhost:4444');

const socketRep = zmq.socket('rep');
socketRep.bind('tcp://*:4444');
socketRep.on('message', (m) => {
    console.log("Mensaje recibido del cliente, respondemos");
    socketRep.send('QUE TAL');
});


const peticion = async () => {
    return new Promise((resolve, reject) => {
        socketReq.send('hola');
        socketReq.on('message', (respuesta) => {
            resolve(respuesta.toString());
        });
    });
}


const cliente = async () => {
    console.log("Enviamos mensaje");
    const respuesta = peticion();
    console.log("Nos han respondido", respuesta);
}
cliente();