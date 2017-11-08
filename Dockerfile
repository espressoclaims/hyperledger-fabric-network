FROM ubuntu:14.04

MAINTAINER Naba S. Siddiqui<naba.sadia.siddiqui@gmail.com>

RUN echo "Starting Hyperledger Fabric" && sh startFabric.sh
