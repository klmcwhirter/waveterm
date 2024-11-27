#!/usr/bin/env bash
#*----------------------------------------------------------------------*
#* Install waveterm into XDG local filesystem
#*----------------------------------------------------------------------*

function waveterm_version
{
	jq -r '.version' ../package.json
}
#*----------------------------------------------------------------------*
option=${1:-""}
install=""

case "${option}" in
    "-i" | "") install="true" ;;
    "-u") ;;
    *) echo "USAGE: $0 [-i] [-u]"; exit 1 ;;
esac

ZIP_FILE=$(ls -1 built/waveterm*.zip 2>&1 | head -1)
if [[ ! -f "${ZIP_FILE}" ]]
then
    echo ===
    echo === ERROR: please build the zip file first
    echo ===
    exit 2
fi

rm -fr $HOME/.local/share/waveterm*

if [[ ! -z ${install} ]]
then
    wt_version=$(waveterm_version)
    unzip -qd $HOME/.local/share/waveterm-${wt_version}/ ${ZIP_FILE}
fi

pushd $HOME/.local/share

if [[ ! -z ${install} ]]
then
    ln -s waveterm-${wt_version} waveterm
fi

cd ../bin
rm -f waveterm
if [[ ! -z ${install} ]]
then
    ln -s ../share/waveterm/waveterm .
fi

# rm -fr $HOME/.config/Wave $HOME/.config/waveterm

popd

#*----------------------------------------------------------------------*
