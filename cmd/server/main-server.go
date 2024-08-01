// Copyright 2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"

	"runtime"
	"sync"
	"syscall"
	"time"

	"github.com/wavetermdev/thenextwave/pkg/blockcontroller"
	"github.com/wavetermdev/thenextwave/pkg/filestore"
	"github.com/wavetermdev/thenextwave/pkg/service"
	"github.com/wavetermdev/thenextwave/pkg/util/shellutil"
	"github.com/wavetermdev/thenextwave/pkg/wavebase"
	"github.com/wavetermdev/thenextwave/pkg/wconfig"
	"github.com/wavetermdev/thenextwave/pkg/web"
	"github.com/wavetermdev/thenextwave/pkg/wshrpc/wshserver"
	"github.com/wavetermdev/thenextwave/pkg/wstore"
)

// these are set at build time
var WaveVersion = "0.0.0"
var BuildTime = "0"

const ReadySignalPidVarName = "WAVETERM_READY_SIGNAL_PID"

var shutdownOnce sync.Once

func doShutdown(reason string) {
	shutdownOnce.Do(func() {
		log.Printf("shutting down: %s\n", reason)
		ctx, cancelFn := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancelFn()
		// TODO deal with flush in progress
		filestore.WFS.FlushCache(ctx)
		watcher := wconfig.GetWatcher()
		if watcher != nil {
			watcher.Close()
		}
		time.Sleep(200 * time.Millisecond)
		os.Exit(0)
	})
}

func installShutdownSignalHandlers() {
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGHUP, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		for sig := range sigCh {
			doShutdown(fmt.Sprintf("got signal %v", sig))
			break
		}
	}()
}

// watch stdin, kill server if stdin is closed
func stdinReadWatch() {
	buf := make([]byte, 1024)
	for {
		_, err := os.Stdin.Read(buf)
		if err != nil {
			doShutdown(fmt.Sprintf("stdin closed/error (%v)", err))
			break
		}
	}
}

func configWatcher() {
	watcher := wconfig.GetWatcher()
	if watcher != nil {
		watcher.Start()
	}
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	log.SetPrefix("[wavesrv] ")
	blockcontroller.WshServerFactoryFn = wshserver.MakeWshServer
	web.WshServerFactoryFn = wshserver.MakeWshServer
	wavebase.WaveVersion = WaveVersion

	err := service.ValidateServiceMap()
	if err != nil {
		log.Printf("error validating service map: %v\n", err)
		return
	}
	err = wavebase.EnsureWaveHomeDir()
	if err != nil {
		log.Printf("error ensuring wave home dir: %v\n", err)
		return
	}
	waveLock, err := wavebase.AcquireWaveLock()
	if err != nil {
		log.Printf("error acquiring wave lock (another instance of Wave is likely running): %v\n", err)
		return
	}
	defer func() {
		err = waveLock.Unlock()
		if err != nil {
			log.Printf("error releasing wave lock: %v\n", err)
		}
	}()

	log.Printf("wave version: %s (%s)\n", WaveVersion, BuildTime)
	log.Printf("wave home dir: %s\n", wavebase.GetWaveHomeDir())
	err = filestore.InitFilestore()
	if err != nil {
		log.Printf("error initializing filestore: %v\n", err)
		return
	}
	err = wstore.InitWStore()
	if err != nil {
		log.Printf("error initializing wstore: %v\n", err)
		return
	}
	go func() {
		err := shellutil.InitCustomShellStartupFiles()
		if err != nil {
			log.Printf("error initializing wsh and shell-integration files: %v\n", err)
		}
	}()
	err = wstore.EnsureInitialData()
	if err != nil {
		log.Printf("error ensuring initial data: %v\n", err)
		return
	}
	installShutdownSignalHandlers()
	go stdinReadWatch()
	configWatcher()
	webListener, err := web.MakeTCPListener("web")
	if err != nil {
		log.Printf("error creating web listener: %v\n", err)
		return
	}
	wsListener, err := web.MakeTCPListener("websocket")
	if err != nil {
		log.Printf("error creating websocket listener: %v\n", err)
		return
	}
	go web.RunWebSocketServer(wsListener)
	unixListener, err := web.MakeUnixListener()
	if err != nil {
		log.Printf("error creating unix listener: %v\n", err)
		return
	}
	go func() {
		pidStr := os.Getenv(ReadySignalPidVarName)
		if pidStr != "" {
			_, err := strconv.Atoi(pidStr)
			if err == nil {
				// use fmt instead of log here to make sure it goes directly to stderr
				fmt.Fprintf(os.Stderr, "WAVESRV-ESTART ws:%s web:%s\n", wsListener.Addr(), webListener.Addr())
			}
		}
	}()
	go web.RunWebServer(unixListener)
	web.RunWebServer(webListener) // blocking
	runtime.KeepAlive(waveLock)
}
