# SimplyPraise — Live persistence fix

This version fixes Live-state restoration across application relaunches.

## Expected behavior

1. Open SimplyPraise and select the desired output display.
2. Select content, then press **Live**. The output window opens fullscreen on that display and shows the selected content. If no content is selected, it starts black.
3. Close SimplyPraise while Live is still on.
4. Reopen SimplyPraise.
5. The output window automatically reopens on the saved display, the Live button is active, and the output remains black until content is selected.
6. Turn Live off before closing to persist Live-off for the next launch.

The app stores the Live preference and last display in its normal Electron user-data `settings.json` file. No manual JSON editing is required for normal use.

## Live-state persistence test

The app remembers whether Live was active when it was closed and remembers the last output display. When SimplyPraise starts with `liveOpen` enabled, the Live output window is reopened on that display and begins black; no previous slide/media is restored automatically. Select a slide while Live is on to send it to the output. Older settings files using `liveOnExit` are still supported.

To test: start the app with `npm start`, select an external display, click Live, select/display a song, close the app, and launch again. The second output window should be present, the Live button should be active (red pulse), and the output should be black. Selecting a slide should then show it on the output. Turning Live off and closing/relaunching should leave Live off and should not open the output window.
