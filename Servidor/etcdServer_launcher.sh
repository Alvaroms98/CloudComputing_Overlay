#!/bin/bash

# Lanzar un contenedor con etcd escuchando a los clientes en el puerto 2379

docker run -d --rm --name Etcd-server \
        --publish 2379:2379 --env ALLOW_NONE_AUTHENTICATION=yes \
        --env ETCD_ADVERTISE_CLIENT_URLS=http://etcd-server:2379 bitnami/etcd