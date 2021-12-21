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

const match = array.find(nodo => nodo.nombre === 'pepe1')

if (match){
    console.log(`el nombre pepe existe en el array`);
} else{
    console.log(`el nombre pepe no exister en el array`);
}

for (const nodo of array){
    console.log(nodo.nombre);
}