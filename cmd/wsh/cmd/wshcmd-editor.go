// Copyright 2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmd

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
	"github.com/wavetermdev/waveterm/pkg/waveobj"
	"github.com/wavetermdev/waveterm/pkg/wps"
	"github.com/wavetermdev/waveterm/pkg/wshrpc"
	"github.com/wavetermdev/waveterm/pkg/wshrpc/wshclient"
)

var editMagnified bool

var editorCmd = &cobra.Command{
	Use:     "editor",
	Short:   "edit a file (blocks until editor is closed)",
	Args:    cobra.ExactArgs(1),
	RunE:    editorRun,
	PreRunE: preRunSetupRpcClient,
}

func init() {
	editCmd.Flags().BoolVarP(&editMagnified, "magnified", "m", false, "open view in magnified mode")
	rootCmd.AddCommand(editorCmd)
}

func editorRun(cmd *cobra.Command, args []string) (rtnErr error) {
	defer func() {
		sendActivity("editor", rtnErr == nil)
	}()

	fileArg := args[0]
	absFile, err := filepath.Abs(fileArg)
	if err != nil {
		return fmt.Errorf("getting absolute path: %w", err)
	}
	_, err = os.Stat(absFile)
	if err == fs.ErrNotExist {
		return fmt.Errorf("file does not exist: %q", absFile)
	}
	if err != nil {
		return fmt.Errorf("getting file info: %w", err)
	}
	wshCmd := wshrpc.CommandCreateBlockData{
		BlockDef: &waveobj.BlockDef{
			Meta: map[string]any{
				waveobj.MetaKey_View: "preview",
				waveobj.MetaKey_File: absFile,
				waveobj.MetaKey_Edit: true,
			},
		},
		Magnified: editMagnified,
	}
	if RpcContext.Conn != "" {
		wshCmd.BlockDef.Meta[waveobj.MetaKey_Connection] = RpcContext.Conn
	}
	blockRef, err := wshclient.CreateBlockCommand(RpcClient, wshCmd, &wshrpc.RpcOpts{Timeout: 2000})
	if err != nil {
		return fmt.Errorf("running view command: %w", err)
	}
	doneCh := make(chan bool)
	RpcClient.EventListener.On(wps.Event_BlockClose, func(event *wps.WaveEvent) {
		if event.HasScope(blockRef.String()) {
			close(doneCh)
		}
	})
	wshclient.EventSubCommand(RpcClient, wps.SubscriptionRequest{Event: wps.Event_BlockClose, Scopes: []string{blockRef.String()}}, nil)
	<-doneCh
	return nil
}
