# OCI based build for waveterm [linux:zip]

Build waveterm for Fedora 41 using OCI container.

This is accomplished using a [Containerfile](./Containerfile) that uses fedora:41 as the base image.

## Perform OCI Build

```bash
docker compose --progress=plain build
```

## Finish the build

```bash
mkdir make  # mounted as a volume in compose.yml

docker compose run -it --rm waveterm bash

go-task -t Taskfile_local.yml -y package:linuxonly

```

## Unzip

```bash
mkdir waveterm
cd waveterm
unzip ../built/waveterm-linux*.zip
```

## Run it

```bash
./waveterm
```

## Install Waveterm

```bash
cd ..  # waveterm/oci-build dir

./xdg_install_waveterm
```

## Clean Up

```bash
docker system prune -af --volumes

cd ..  # waveterm/oci-build dir
rm -fr built
```
