// Interfaz de usuario (UI) para comunicarse con el deamon que le gestiona las tareas
// de creación y destrucción de contenedores en el cluster de la LAN

// Dependencias
const { stringify } = require('querystring');
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

        // Respuestas del deamon
        this.socketReq.on('message',(metodo, argumentos) => {
            try{
                metodo = metodo.toString();

                if (metodo === 'estaEsLaInfo'){
                    // Este caso especial separamos por tabulador porque vienen JSONs
                    argumentos = argumentos.toString().split('\t');
                    //console.log(`Respuesta del deamon a Info -> metodo: ${metodo}, respuesta: ${argumentos}`);
                    this[metodo](...argumentos);
                } else{
                    argumentos = argumentos.toString().split(',');

                    console.log(`Respuesta del deamon -> metodo: ${metodo}, respuesta: ${argumentos}`);
                    this[metodo](...argumentos);
                }

            } catch(err){
                console.log(err);
            }
        });
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

    async nodoConfigurado(mensaje){
        console.log(mensaje);

        this.imprimirMenu();
        const opcion = await this.preguntaAlUsuario('Escriba una opción: ');

        // Esto hay que cambiarlo

        switch (opcion){
            case "1":
                this.quieroContenedor();
                break;
            case "2":
                
        }
        console.log(`Ha elegido la opción ${opcion}, falta configurarla jajajaja`);
        this.teclado.close();
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
        console.log(`${item1}\n${item2}\n${item3}\n${item4}`);
    }

    estaEsLaInfo(objetos, nodosActivos){
        // Truquito para el string de jsons en objetos
        objetos = objetos.replaceAll('},{','}|{').split('|');
        objetos.forEach((objeto,index,array) => {
            array[index] = JSON.parse(objeto);
        });

        // Los nodos activos (puede que no tengan contenedores activos)
        nodosActivos = nodosActivos.split(',');


        // Sacar por pantalla la información
        console.log("\nINFORMACION DEL SISTEMA\n");
        console.table(objetos);

        console.log("\nNODOS ACTIVOS\n");
        console.table(nodosActivos);
    }

    async quieroContenedor(){
        // Pedir información de los nodos disponibles

        // Pedir nodo donde ponerlo
        
        // Pedir nombre del contenedor

        // deamon.levantaContenedor
        return
    }

    // Proxy del deamon

    // En los proxys mandamos como primer elemento del array el método
    // y el resto son los argumentos

    configurameElNodo(subred){
        const metodo = 'configurameElNodo';
        const argumentos = subred;
        this.socketReq.send([metodo, argumentos]);
    }

    infoSistema(){
        const metodo = 'infoSistema';
        const argumentos = '';
        this.socketReq.send([metodo,argumentos]);
    }

    levantaContenedor(){
        return
    }

}

const main = async () => {
    const puertoDeamon = process.argv[2] || 5002;

    const menu = new Menu(puertoDeamon);
    await menu.configurarNodo();
    menu.infoSistema();

    // Para quitar la interfaz
    process.on('SIGINT', () => {
        console.log("\nDesconectandome del deamon y quitando interfaz");
        menu.socketReq.close();
    })
}

main();