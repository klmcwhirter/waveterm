#!/usr/bin/env bash
#*----------------------------------------------------------------------*
#* Install waveterm into XDG local filesystem
#*----------------------------------------------------------------------*

function waveterm_version
{
	jq -r '.version' ../package.json
}
#*----------------------------------------------------------------------*

rm -fr $HOME/.local/share/waveterm*

wt_version=$(waveterm_version)
cp -pr waveterm/ $HOME/.local/share/waveterm-${wt_version}/

pushd $HOME/.local/share

ln -s waveterm-${wt_version} waveterm

cd ../bin
rm -f waveterm
ln -s ../share/waveterm/waveterm .

# rm -fr $HOME/.config/Wave $HOME/.config/waveterm

popd

#*----------------------------------------------------------------------*
