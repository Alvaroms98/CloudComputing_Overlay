# Construcción de una red Overlay

<!-- RESUMEN -->
Este proyecto consiste en la construcción y configuración de una red overlay
entre contenedores, sobre un cluster cuyos nodos se encuentran en la misma LAN. Utilizando las interfaces de red virtuales disponibles en el núcleo de Linux, así como el framework [Netfilter](https://www.netfilter.org/), los contenedores que se lancen a partir de esta
aplicación podrán comunicarse entre ellos como si estuviesen en la misma red de nivel 2.


<!-- INDICE -->
## Tabla de contenidos

1. [Instrucciones para el despliegue](#instrucciones)  
    1.1. [Pre-requisitos](#instrucciones/pre-requisitos)  
    1.2. [Instalación](#instrucciones/instalacion)  
    1.3. [Despliegue](#instrucciones/despliegue)  
2. [Cómo usar la Consola](#consola)
3. [Configuración de red](#red)  
    3.1. [Alcance de los contenedores](#red/alcance)  
    3.2. [Esquema general](#red/esquema)  
    3.3. [Interfaces de red virtuales](#red/interfaces)  
    3.4. [Reglas de encaminamiento](#red/reglas)  
    3.5. [Netfilter con IPTABLES](#red/iptables)
4. [Diagramas de interacciones](#interacciones)  
    4.1. [Preparar nodo](#interacciones/preparar)  
    4.2. [Levantar contenedor](#interacciones/levantar)  
    4.3. [Eliminar contenedor](#interacciones/eliminar)
5. [Esquema de conexiones con ZeroMQ](#conexiones)
6. [Generalización del caso para producción](#generalizacion)
7. [Tecnologías utilizadas por la aplicación](#tecnologias)

___
<!-- COMO USAR -->

## 1. Instrucciones para el despliegue <a name="instrucciones"></a>

***Para poder visualizar el comportamiento de la red *overlay* se recomienda disponer de un mínimo de dos nodos.***

### 1.1. Pre-requisitos <a name="instrucciones/pre-requisitos"></a>

Este *software* está pensando para ser ejecutado sobre un sistema operativo Linux. Además, es necesario tener instaladas las siguientes aplicaciones:

* [Docker Engine](https://docs.docker.com/engine/install/)
* [Docker CLI](https://docs.docker.com/engine/reference/commandline/cli/)
* [Node.js](https://nodejs.org/en/)
* [NPM](https://www.npmjs.com/)

### 1.2. Instalación <a name="instrucciones/instalacion"></a>

<!-- Poner una casilla para clonar el repositorio -->

Una vez clonado el repositorio en alguno de los nodos del cluster, hay que instalar las dependencias del código de **Node.js**. Ejecuta los siguiente comandos en la terminal:

```bash
cd Servidor/

npm install

cd ../Nodo

npm install
```

Este proceso ha de repetirse por cada uno de los nodos que vayan a participar en el cluster,
con la salvedad de que no es necesario descargar ni instalar la parte del **Servidor** más que
en un único nodo.

### 1.3. Despliegue <a name="instrucciones/despliegue"></a>

#### Servidor

Una vez elegido cual de los nodos va actuar como servidor, hay que ponerlo en marcha. Lo primero es levantar un contenedor con **etcd**, que es una base de datos *clave-valor* de la que va a hacer uso el servidor para la gestión de las direcciones IP de los contenedores. Dentro de la carpeta `Servidor`, ejecutar:

```bash
./etcdServer_launcher.sh
```
Este pequeño *script* lanza un contenedor **Docker** con la base de datos **etcd**, exponiendo el puerto 2379, que es el que por defecto se utiliza para acceder a su API.

Para poner en marcha el servidor se ejecuta el siguiente comando:

```
node servidor.js [puertoRep] [puertoPub] [puertoPull]
```

Por defecto:

* puertoPub = 8080
* puertoRep = 8081
* puertoPull = 8082

No se recomienda cambiar el valor de los puertos que expone el servidor, salvo que se tenga en cuenta cuando se configuren los nodos.

#### Nodo <a name="apartadoNodo"></a>

Con el servidor en marcha, se ha de dar de alta a los nodos que participarán en el cluster. Dentro de la carpeta `Nodo`, ejecutar:

```
node deamon.js <Nombre Nodo> <IP servidor>
```

El programa *deamon.js* contacta con el servidor para darse de alta otorgando su nombre y su dirección IP (internamente el programa extrae la dirección IP del nodo). Si el nodo ya está registrado por el servidor (se comprueba la IP del nodo), este lo expulsará.

Una vez el nodo se haya registrado, y esté *deamon* ejecutándose en el *background*, se puede abrir la consola:

```
node contman.js
```

El programa *contman.js* o **consola** es la API del cluster. Se trata de un menú interfaz por terminal que permite la gestión de los contenedores del cluster. La primera vez que se acceda a la consola, se pondrá en contacto con el *deamon* del nodo para configurarlo. Se le pedirá al usuario el segmento de red en el que se situarán los contenedores que se levanten en ese nodo.

Una vez se tiene el nodo configurado, se puede navegar por las diferentes opciones del menú. Además, se puede abrir y cerrar la consola a voluntad para hacer las configuraciones necesarias, ya que es solamente una interfaz, no tiene estado. En la [Sección 2](#consola) se encuentra una explicación detallada del uso de la consola.

Es necesario repetir los pasos de este [apartado](#apartadoNodo) por cada nodo que se quiera dar de alta en el cluster.

Si has seguido los pasos de la instalación hasta este punto, ya tienes todo listo para hacer uso de la aplicación, enhorabuena!


<!-- COMO USAR LA CONSOLA -->
## 2. Cómo usar la Consola <a name="consola"></a>

<!-- Configuración -->

La primera vez que se ejecuta el *deamon* en el nodo, este se da alta en el cluster, pero no configura el entorno hasta que se entra en la consola. Es por ello, que la primera vez que se entre a la consola, esta te pedirá el segmento de red donde poner los contenedores, como se puede ver en la imagen que se encuentra a continuación:

![Configuración del nodo](aux/configuracion.png)


<!-- Menú -->

Una vez completado el paso anterior, la consola presentará un menú interfaz como el que se puede ver en la siguiente imagen:

![Menú](aux/menu.png)

Explicación de cada una de las opciones:

1. **Levantar Contenedor**. Se presenta al usuario una tabla con los nombres de los objetos (contenedores o *bridges* virtuales) que tienen asociada una dirección IP de la red *overlay*, así como el nombre del nodo en donde se encuentran. A patir de esta información se le pedirá al usuario que elija el nodo y el nombre del contenedor que se quiere levantar.

2. **Destruir Contenedor**. Se presenta al usuario una tabla con los nombres de los contenedores activos en el cluster (similar al caso anterior). El usuario debe escribir el nombre del contenedor que se quiere tumbar.

3. **Información del sistema**. Se proporciona al usuario información en tiempo real de los contenedores activos en el cluster, su dirección IP y el nodo en el que se encuentran. Además, se muestra en una tabla separada los nodos que están dados de alta (es posible que no tengan asociado ningún contenedor), así como las métricas más relevantes (CPU y RAM) para que el usuario pueda hacerse una idea del grado de ocupación de un nodo, y, eligir de manera óptima dónde desplegar el siguiente contenedor. Las métricas de los nodos se actualizan cada 10 segundos.

4. **Dar de baja nodo y cerrar**. Esta opción comunica al sistema todos los objetos que va a eliminar (contenedores y *bridge*) para que se liberen las direcciones IP de la base de datos. A continuación, tumba todos contenedores que tiene asociados y elimina toda la configuración de red. Tras esta operación, el nodo está dado de baja del cluster y con un estado igual al de antes de configurarse.

5. **Cerrar consola**. Cerrar la consola no altera en absoluto al nodo o al cluter, como se ha dicho antes, el programa *contman.js* carece de estado, por tanto, cerrar la consola únicamente corta la comunicación con el *deamon*. Si en algún momento se cierra la consola, se puede abrir nuevamente y el sistema se encontrará en el mismo estado en el que se dejó en un punto anterior (siempre que no se haya accedido al sistema con otra consola desde otro nodo).

<!-- Información del sistema -->
![info](aux/info.png)




<!-- CONFIGURACIÓN RED -->

## 3. Configuración de red <a name="red"></a>

### 3.1. Alcance de los contenedores <a name="red/alcance"></a>

En esta sección se explica cómo el programa implementa la configuración de red de los contenedores para que sean capaces de comunicarse entre ellos como si estuviesen en el mismo segmento de red a nivel 2, sobre una comunicación física a nivel 3.

Antes de entrar en el detalle de la configuración, cabe destacar que cada uno de los contenedores es capaz de establecer comunicación con:

* Contenedores que se encuentren en el mismo nodo.
* El nodo que ejerce como host del propio contenedor.
* Cualquier otro nodo del cluster
* Cualquier otro contenedor del cluster que se encuentre en un nodo distinto al propio.
* Con internet (si es que el nodo en el que se encuentra puede hacerlo).

### 3.2. Esquema general <a name="red/esquema"></a>

A continuación, se presenta un esquema orientativo de la configuración de red que se encuentra en cada uno de los nodos, suponiendo que tienen dos contenedores activos:

![Esquema red](aux/EsquemaOverlay.png)

Todo contenedor se sitúa dentro de un *Network Namespace*, en su interior se encuentra uno de los extremos de la interfaz de red virtual *VETH*, a la que se le asocia una dirección IP del segmento de red elegido. El otro extremo de la interfaz *VETH* se encuentra en el *Network Namespace* del host, conectado a una interfaz *bridge*. Por otro lado, desde la interfaz de red física del host (*eth0*), se crea una interfaz *VxLAN*, que también se conecta al *bridge*. Esta configuración es análoga para cada nodo miembro del cluster, una vez se ha configurado.

### 3.3. Interfaces de red virtuales <a name="red/interfaces"></a>

Utilizando el paquete [iproute2](https://es.wikipedia.org/wiki/Iproute2) se puede, de manera sencilla, administrar las interfaces de red y conexiones de las que dispone el núcleo de Linux:

* **Virtual ETHernet** (VETH). Es una virtualización de una conexión ethernet local. Se crea a pares, y es usualmente utilizada para comunicar *Network Namespaces*. Comando para crear un par de interfaces *VETH*:

```
ip link add <veth_edge1> type veth peer name <veth_edge2>
```

* **Linux Bridge**. Es una virtualización de un dispositivo *switch*. Todos los paquetes que le llegan los resparte entre todas las interfaces conectadas a él. Comando para crear un *bridge* y conectarle interfaces:

```
ip link add <name> type bridge
ip link set <if_name> master <bridge_name>
```

* **VxLAN**. Es un dispositivo que utiliza el protocolo de tunelización para enmascarar paquetes de nivel 2 sobre paquetes UDP-IP. Para esta aproximación se ha utilizado la virtualización que permite formar un grupo *multicast* para que el descubrimiento de nuevas interfaces entre nodos se haga de forma dinámica. Esto permite que el dispositivo *VxLAN* actúe como ***Proxy ARP***, es decir,que cuando le lleguen paquetes del grupo *multicast* con direcciones IP de las cuales él conozca las direcciones MAC, las pueda responder. Para crear esta interfaz de red virtual, en la configuración que se ha discutido se ha de ejecutar el siguiente comando:

    * **VNI**: Identificador de la red VxLAN
    * **Group**: Dirección IP para formar el grupo *multicast* por el que se comunicaran los distintos *VTEP* (*VxLAN Tunnel End Point*) pertenecientes a la misma VxLAN, para realizar el descubrimiento dinámico de direcciones MAC.


```
ip link add <name> type vxlan id <VNI> dstport <port> group <address> dev <host_if> ttl <number>
```


### 3.4. Reglas de encaminamiento <a name="red/reglas"></a>

Para que los contenedores sean capaces de comunicar con su propio host, y viceversa, es necesario añadir un par de reglas de encaminamiento:

* En el host, al asignarle una dirección IP al *bridge* (dentro del *Network Namespace* del host), este puede utilizar este dispositivo como *gateway* para comunicarse con toda la red *overlay*.

```
<overlay_subnet> dev <bridge_name> proto kernel scope link src <bridge_address>
```

* Dentro del *Network Namespace* del contenedor.

```
default via <bridge_address> dev eth0 src <cont_address>
```

### 3.5. Netfilter con IPTABLES <a name="red/iptables"></a>

Para que los contenedores sean capaces de comunicarse con el resto de nodos pertenecientes a la LAN, así como, para establecer comunicación con internet, es necesario el empleo de ***Network Address Translator*** (***NAT***). De igual manera que los *routers* emplean esta técnica para comunicar los dispositivos de una LAN con los de otra LAN (tanto por motivos de seguridad como por escased de IPv4), si se quiere establecer comunicación desde dentro de un contenedor con el exterior del nodo, este último ha de actuar como *router*.

Por tanto, la regla que hay que añadir a la tabla de **NAT** de **IPTABLES** (en la cadena de *POSTROUTING*), es la siguiente:

```
iptables -t nat -A POSTROUTING -s <overlay_subnet> -o <host_if> -j MASQUERADE
```

Por defecto, **Docker Engine** modifica la política de la cadena de *FORWARD* tomando la acción de *DROP*. Esto provoca que ninguna interfaz de red que se encuentre en el *Network Namespace* del host sea capaz de redirigir paquetes. La solución más trivial es cambiar esta politica a *ACCEPT* (también se podrían poner reglas específicas que permitan la redirección a un cierto segmento de red):

```
iptables -t filter -P FORWARD ACCEPT
```


<!-- DIAGRAMAS DE INTERACCIONES -->

## 4. Diagramas de interacciones <a name="interacciones"></a>

Para dar una idea al lector de cómo está implementado el código, es decir, cómo se coordinan los *deamons* para llevar a cabo las tareas de la aplicación, en esta sección se presentan los diagramas de interacción más relevantes. Estos diagramas no incluyen todas las acciones, pues no están incluidas las interacciones para la recogida de métricas, o cómo se da de baja un nodo del cluster, pero dan una visión general del funcionamiento de la aplicación. 

Cabe destacar, que la aproximación implementada consiste en un sistema centralizado. El motivo de esta elección es para evitar la complejidad que puede suponer los algoritmos de formación de grupos dinámicos. En esta implementación todas las peticiones son interceptadas por el servidor y redirigidas, dado el caso, al *deamon* correspondiente.

### 4.1. Preparar nodo <a name="interacciones/preparar"></a>
El diagrama que se presenta a continuación explica dos interacciones distintas:

1. Configuración del nodo
2. Cómo un nodo se da de alta en el cluster

La primera interacción comienza desde el arranque de la consola, mientras que la segunda interacción se inicia cuando ejecuta por primera vez el *deamon* del nodo.

![Interacción: Preparar Nodo](aux/diseñoOverlay_PrepararNodo.png)

___
### 4.2. Levantar contenedor <a name="interacciones/levantar"></a>

En el siguiente diagrama se recrean las interacciones necesarias para la creación de un nuevo contenedor. Son dos los contactos desde el *deamon* al servidor; el primero es para solicitar información de los nodos activos en el cluster, el segundo contacto es para enviar la petición de levantar el contenedor. Una vez el servidor procesa la información y encuentra una dirección IP libre del segmento de red indicado, publica la tarea a todos los nodos del cluster, y, únicamente el nodo indicado ejecuta la tarea.

![Interacción: Levantar Contenedor](aux/diseñoOverlay_LevantarContenedor.png)

___

### 4.3. Eliminar contenedor <a name="interacciones/eliminar"></a>

Para la eliminación de un contenedor se siguen acciones similares al del caso anterior. Dos contactos con el servidor son necesarios; primero una solicitud para conocer el estado de los contenedores en el cluster, es decir, cuántos hay, cómo se denominan y dónde se encuentran. A partir de esta información, el usuario es capaz de seleccionar uno, y, el *deamon* reenvía la petición al servidor. Este último, tras eliminar de la base de datos la existencia del contenedor que se desea eliminar, publica la tarea al cluster para que el nodo que lo contenga lo tumbe.

![Interacción: Eliminar Contenedor](aux/diseñoOverlay_EliminarContenedor.png)
___




<!-- DIAGRAMAS DE CONEXIONES -->

## 5. Esquema de conexiones con ZeroMQ <a name="conexiones"></a>

Para coordinar múltiples procesos en un sistema distribuido hacen falta uno o varios canales de comunicación. En esta aplicación se ha optado por la utilización de la librería de pasos de mensajes de [ZeroMQ](https://zeromq.org/), ya que proporciona varios patrones de comunicación que se ajustan a los requerimientos de la aplicación. 

Los patrones de comunicación que se han utilizado son:

* **Request-Reply**. Este patrón también es conocido como **Cliente-Servidor**. El *socket* **reply** hace de servidor, seleccionando un puerto donde hacer *bind*, quedando a la espera de peticiones. Por otro lado, el *socket* **request** (cliente) se conecta al puerto del servidor para poder enviar peticiones. Cabe destacar, que en ZeroMQ toda petición ha de ser respondida antes de poder antender otras peticiones. Dentro de la aplicación este patrón se utiliza tanto para las peticiones de la consola al *deamon*, como para las peticiones del *deamon* al servidor.

* **Publisher-Subscriber**. En este patrón, el *socket* **publisher** hace *bind* en un puerto, y el/los *sockets* **subscriber** se conectan y se suscriben al tema que quieren recibir (en el caso de la aplicación hay un único tema 'deamon'). Posteriormente, el **publisher** envía mensajes por ese canal, siendo estos mensajes recibidos por todos los **subscribers**. Este par de *sockets* ha sido utilizado para el envío de tareas desde el servidor al resto de nodos del cluster. Las tareas que se publican por este canal son:  
    * Levantar contenedor
    * Tumbar contenedor
    * Solicitud de métricas

* **Push-Pull**. El envío de mensajes de este patrón es similar al de Request-Reply, con la diferencia de que el *socket* que recibe los mensajes (**pull**) no responde al *socket* que los envía (**push**). La inclusión de este patrón en la aplicación ha sido necesario para solventar un potencial error en el envío de las métricas, por parte de los nodos, al servidor. El problema podía darse si coincidia el momento en que el *deamon* esperaba la confirmación del envío de métricas al servidor, con una solicitud de darse de baja del cluster. Luego, la forma de solicionar el problema ha sido añadir este patrón, pues cuando los *deamons* envían las métricas al servidor, no esperan ninguna respuesta del último.  

La siguiente imagen representa un esquema de las conexiones del sistema:

![Conexiones con ZeroMQ](aux/ConexionesZeroMQ.png)


<!-- GENERALIZACIONES PARA PRODUCCIÓN -->

## 6. Generalización del caso para producción <a name="generalizacion"></a>

En esta sección se plantean las mejoras necesarias que se deberían implementar para poder llevar la aplicación a producción:

1. **Elección de imagen de los contenedores**. En esta versión del código al usuario no se le permite elegir una imagen Docker con la que crear un nuevo contenedor. Luego, en la rutina de creación de un nuevo contenedor se debería aceptar como argumento de entrada el nombre, o la ruta, de la imagen Docker, y el nodo debería de poder ser capaz de descargarla desde algún [Docker Registry](https://docs.docker.com/registry/) (p.e. [Docker Hub](https://hub.docker.com/)).

2. **Exposición de puertos**. En la misma rutina que se menciona en el caso anterior, se deberían poder aceptar parámetros para que el contenedor haga *bind* a uno o varios puertos del host. Este es el caso típico de cuando un contenedor toma el papel de *front-end* de una aplicación. Para implementar esta mejora se leerían los puertos solicitados por el usuario y se aplicarían reglas de IPTABLES para redirigir el tráfico entrante al host, a un cierto puerto, hacia el contenedor. Además, o bien el *deamon*, o el servidor, tendría que tener constancia de estas reglas para eliminarlas en caso de eliminar el contenedor:

```
iptables -t nat -A PREROUTING -i <host_if> -p <protocol> --dport <host_port> -j DNAT --to-destination <cont_address>:<cont_port>
```

3. **Replicación del servidor**. Tanto para tener tolerancia a fallos, como para soportar las múltiples peticiones de los nodos del cluster. Se podría tener múltiples nodos que hagan el papel de servidor, con un balanceador de carga de por medio que repartiera el tráfico hacia estos nodos. Como la aplicación ya utiliza la base de datos **Etcd**, el problema de la consistencia entre servidores no supondría un gran reto. **Etcd** está pensado para ser replicado (también conocido como cluster **Etcd**), pues internamente emplea un protocolo de consistencia fuerte, denominado [Raft](http://thesecretlivesofdata.com/raft/). Por tanto, implementar la replicación del servidor sería automatizar la puesta en marcha de un cluser **Etcd**.

4. **Comprobación del estado de los nodos**. En esta versión de la aplicación, cuando un nodo se muere, sin haberse dado antes de baja del cluster, el servidor no se da cuenta, por tanto, cuando le piden información del sistema, da por hecho de que dicho nodo sigue sano, y con todos los contenedores activos. Habría que incorporar un método que periódicamente comprobara el estado de los nodos, para que en el caso que uno fallara, se actualizará la información del sistema (liberando de la base de datos los objetos que contuviese dicho nodo).

Aplicando estas mejoras al código, es posible que estuviera lista para ser utilizada en producción.

<!-- TECNOLOGIAS EMPLEADAS -->

## 7. Tecnologías utilizadas por la aplicación <a name="tecnologias"></a>

Las tecnologías y herramientas empleadas para la construcción de esta aplicación son:

* [Node.js](https://nodejs.org/en/)
* API de [ZeroMQ](https://zeromq.org/) para Node.js
* API de [Etcd](https://github.com/microsoft/etcd3) para Node.js
* Paquete de configuración de red [iproute2](http://www.policyrouting.org/iproute2.doc.html)
* [Docker](https://www.docker.com/)

Lenguajes:

* JavaScript
* Bash
* Dockerfile

___