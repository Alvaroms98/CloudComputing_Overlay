# Dockerfile para generar la imagen con el paquete iproute2

FROM ubuntu:20.04

# Actualizar SO
RUN apt -y update && apt -y upgrade

# Paquete para trabajar con "ip"
RUN apt install -y iproute2

# Paquete para utilizar "ping"
RUN apt install -y iputils-ping

# Proceso a ejecutar cuando se lance el contenedor
CMD bash
