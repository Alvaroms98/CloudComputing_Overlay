// Interfaz de usuario (UI) para comunicarse con el deamon que le gestiona las tareas
// de creación y destrucción de contenedores en el cluster de la LAN

// Dependencias
const readline = require('readline');
const zmq = require('zeromq');

class Menu{
    constructor(puertoDeamon){
        this.puertoDeamon = puertoDeamon;

        // interfaz para escribir por consola
        this.teclado = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        // socket zmq Req para hacer peticiones al deamon
        this.socketReq = zmq.socket('req');
        this.socketReq.connect(`tcp://localhost:${puertoDeamon}`);
    }
    
    async configurarNodo(){
        let flag = false;
        let subred;
        while(!flag){
            subred = await this.preguntaAlUsuario('¿Segmento de red donde poner los contenedores?: (p.e. 192.168.111.0/24) ');
            if (subred.split('.').length === 4 && subred.split('/').length === 2){
                flag = true;
            } else{
                console.log('Segmento de red erróneo, pruebe de nuevo...\n');
            }
        }

        this.configurameElNodo(subred)
    }

    preguntaAlUsuario(pregunta){
        return new Promise((resolve) => {
            this.teclado.question(pregunta, (respuesta) => {
                resolve(respuesta)
            })
        });
    }

    imprimirMenu(){
        const item1 = '1. Levantar Contenedor';
        const item2 = '2. Destruir Contenedor';
        const item3 = '3. Información del sistema';
        const item4 = '4. Salir del menú';
        const item5 = '\nEscriba su respuesta\n'
        console.log(`${item1}\n${item2}\n${item3}\n${item4}\n${item5}`);
    }

    // Proxy del deamon

    // En los proxys mandamos como primer elemento del array el método
    // y el resto son los argumentos

    async configurameElNodo(subred){
        const metodo = 'configurameElNodo';
        await this.socketReq.send([metodo, subred])
    }

}

const main = async () => {
    const puertoDeamon = process.argv[2] || 5000;

    const menu = new Menu(puertoDeamon);
    await menu.configurarNodo();
    console.clear();
    menu.imprimirMenu();


}

main();