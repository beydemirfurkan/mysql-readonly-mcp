# Contributing

## Local setup

```bash
npm install
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## Run locally

```bash
MYSQL_HOST=localhost \
MYSQL_USER=root \
MYSQL_PASSWORD=password \
MYSQL_DATABASE=mydb \
npm start
```

On Windows PowerShell:

```powershell
$env:MYSQL_HOST = "localhost"
$env:MYSQL_USER = "root"
$env:MYSQL_PASSWORD = "password"
$env:MYSQL_DATABASE = "mydb"
npm start
```
