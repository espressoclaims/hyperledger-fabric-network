FROM ubuntu:14.04

MAINTAINER Naba S. Siddiqui<naba.sadia.siddiqui@gmail.com>

RUN ls && cd fabcar && sh startFabric.sh
