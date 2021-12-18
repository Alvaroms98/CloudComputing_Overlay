class Nodo{
    constructor(nombre,subred){
        this.nombre = nombre;
        this.subred = subred;

        [this.dir, this.masc] = this.subred.split('/');
        
    }
}

const array = [];


array.push(new Nodo('zeus', '192.168.111.0/24'));
array.push(new Nodo('pepe', '192.168.1.0/24'));

console.log(array);

console.log(array.find(nodo => nodo.nombre === 'pepe'));