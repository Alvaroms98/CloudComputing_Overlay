# Construcción de una red Overlay

<!-- RESUMEN -->
Este proyecto consiste en la construcción y configuración de una red overlay
entre contenedores, sobre un cluster cuyos nodos se encuentran en la misma LAN. Utilizando las interfaces de red virtuales disponibles en el núcleo de Linux, así como el framework **Netfilter**, los contenedores que se lancen a partir de esta
aplicación podrán comunicarse entre ellos como si estuviesen en la misma red de nivel 2.


<!-- INDICE -->
## Tabla de contenidos

1. [Instrucciones para el despliegue](#instrucciones)
2. [Cómo usar la Consola](#consola)
3. [Configuración de red](#red)
4. [Generalización del despliegue](#generalizacion)
5. [Implementación con Node.js](#implementacion)
6. [Diagrama de conexiones con ZeroMQ](#conexiones)


<!-- COMO USAR -->

## Instrucciones para el despliegue <a name="instrucciones"></a>

***Para poder visualizar el comportamiento de la red *overlay* se recomienda disponer de un mínimo de dos nodos.***

### Pre-requisitos

Este *software* está pensando para ser ejecutado sobre un sistema operativo Linux. Además, es necesario tener instaladas las siguientes aplicaciones:

* [Docker Engine](https://docs.docker.com/engine/install/)
* [Docker CLI](https://docs.docker.com/engine/reference/commandline/cli/)
* [Node.js](https://nodejs.org/en/)
* [NPM](https://www.npmjs.com/)

### Instalación

<!-- Poner una casilla para clonar el repositorio -->

Una vez clonado el repositorio en alguno de los nodos del cluster que se va a generar, hay que instalar las dependencias del código de **Node.js**. Ejecuta los siguiente comandos en la terminal:

```bash
cd Servidor/

npm install

cd ../Nodo

npm install
```

Este proceso ha de repetirse por cada uno de los nodos que vayan a participar en el cluster,
con la salvedad de que no es necesario descargar ni instalar la parte del **Servidor** más que
en un único nodo.

### Despliegue

#### Servidor

Una vez elegido cual de los nodos va actuar como servidor, hay que ponerlo en marcha. Lo primero es levantar un contenedor con **etcd**, que es una base de datos *clave-valor* de la que va a hacer uso el servidor para la gestión de las direcciones IP de los contenedores. Dentro de la carpeta `Servidor`, ejecutar:

```bash
./etcdServer_launcher.sh
```
Este pequeño *script* lanza un contenedor **Docker** con la base de datos **etcd**, exponiendo el puerto 2379, que es el que por defecto se utiliza para acceder a su API.

Para poner en marcha el servidor se ejecuta el siguiente comando:

```bash
node servidor.js [puertoRep] [puertoPub] [puertoPull]
```

Por defecto:

* puertoPub = 8080
* puertoRep = 8081
* puertoPull = 8082

No se recomienda cambiar el valor de los puertos que expone el servidor, salvo que se tenga en cuenta cuando se configuren los nodos.

#### Nodo <a name="apartadoNodo"></a>

Con el servidor en marcha, se ha de dar de alta a los nodos que participarán en el cluster. Dentro de la carpeta `Nodo`, ejecutar:

```bash
node deamon.js <Nombre Nodo> <IP servidor>
```

El programa *deamon.js* contacta con el servidor para darse de alta otorgando su nombre y su dirección IP (internamente el programa extrae la dirección IP del nodo). Si el nodo ya está registrado por el servidor (se comprueba la IP del nodo), este lo expulsará.

Una vez el nodo se haya registrado, y el *deamon* ejecutándose en el *background*, se puede abrir la consola:

```bash
node contman.js
```

El programa *contman.js* o la **consola** es la API del cluster. Se trata de un menú interfaz por terminal que permite la gestión de los contenedores del cluster. La primera vez que se acceda a la consola, se pondrá en contacto con el *deamon* del nodo para configurarlo. Se le pedirá al usuario el segmento de red en el que se situarán los contenedores que se levanten en ese nodo.

Una vez se tiene el nodo configurado, se puede navegar por las diferentes opciones del menú. Además, se puede abrir y cerrar la consola a voluntad, para hacer las configuraciones necesarias, ya que es solamente una interfaz, no tiene estado. En la [Sección 2](#consola) se encuentra una explicación detallada del uso de la consola.

Es necesario repetir los pasos de este [apartado](#apartadoNodo) por cada nodo que se quiera dar de alta en el cluster.

Si has seguido los pasos de la instalación hasta este punto, ya tienes todo listo para hacer uso de la aplicación, enhorabuena!


<!-- COMO USAR LA CONSOLA -->
## Cómo usar la Consola <a name="consola"></a>


<!-- APROXIMACION RED -->

## Configuración de red <a name="red"></a>

<!-- GENERALIZACIÓN -->

## Generalización del despliegue <a name="generalizacion"></a>

<!-- DIAGRAMAS DE FLUJO -->

## Implementación con Node.js <a name="implementacion"></a>

<!-- DIAGRAMAS DE CONEXIONES -->

## Diagrama de conexiones con ZeroMQ<a name="conexiones"></a>