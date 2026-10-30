# Deploy em produção

Tudo roda num único servidor Linux, em contêineres. O Caddy é a única porta de
entrada e obtém o certificado HTTPS sozinho; API, PostgreSQL, MinIO e SigNoz
ficam atrás dele, sem portas abertas para a internet.

| Serviço | Papel |
| --- | --- |
| caddy | proxy reverso com HTTPS (portas 80 e 443) |
| migrate | aplica as migrações e encerra |
| api | API NestJS |
| db | PostgreSQL |
| minio | fotos das tarefas |
| SigNoz | logs, rastros e métricas |

## 1. Domínio

Crie um registro A apontando o domínio para o IP do servidor e confira:

```bash
dig +short seu-dominio.exemplo
```

## 2. Servidor

Num Ubuntu recém-instalado, como root:

```bash
adduser --disabled-password --gecos "" taskplay
usermod -aG sudo taskplay
passwd taskplay

curl -fsSL https://get.docker.com | sh
usermod -aG docker taskplay

fallocate -l 4G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```

Instale sua chave (`ssh-copy-id taskplay@<ip-do-servidor>`) e desative o login
por senha no `/etc/ssh/sshd_config`.

## 3. Código e segredos

Como `taskplay`:

```bash
git clone https://github.com/devmeloscr/taskplay-tcc.git ~/taskplay
cd ~/taskplay
./deploy/gerar-segredos.sh seu-dominio.exemplo seu-email@exemplo.com
```

O script cria `deploy/.env` com senhas aleatórias e não sobrescreve um arquivo
existente. Guarde uma cópia fora do servidor.

## 4. Subir

A observabilidade sobe primeiro, porque a aplicação usa a rede dela:

```bash
docker compose --project-directory observability/pours/deployment \
  -f observability/pours/deployment/compose.yaml \
  -f deploy/compose.observability.yaml up -d

docker compose -f deploy/compose.yaml up -d --build
```

O servidor não precisa de Node nem de pnpm: a imagem da API é compilada dentro
do Docker.

## 5. Conferir

```bash
docker compose -f deploy/compose.yaml ps
curl https://seu-dominio.exemplo/api/health
```

A rota de saúde consulta o banco e responde 503 quando ele está fora do ar.

## 6. Ferramentas de operação

SigNoz e console do MinIO não são publicados. Acesse por túnel SSH:

```bash
ssh -L 8080:127.0.0.1:8080 taskplay@<ip-do-servidor>   # SigNoz
ssh -L 9001:127.0.0.1:9001 taskplay@<ip-do-servidor>   # MinIO
```

No SigNoz, ajuste a retenção em `Settings > Retention` antes de receber dados
reais.

## 7. Atualizar

```bash
cd ~/taskplay && git pull
docker compose -f deploy/compose.yaml up -d --build
```
