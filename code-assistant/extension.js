

// // // extension.js

// const vscode = require('vscode');
// const fs = require('fs');
// const os = require('os');
// const path = require('path');
// const { spawn, execSync } = require('child_process');
// const http = require('http');

// let extensionContext = null;
// let voicePanelInstance = null;

// /* ----------------- Utilities ----------------- */
// // ... (getSoxExecutable, waitForCondition, postJSONRequest functions are unchanged) ...
// function getSoxExecutable() {
//     const envPath = process.env.SOX_PATH;
//     if (envPath && fs.existsSync(envPath)) return envPath;
//     try {
//         if (process.platform === 'win32') {
//             const out = execSync('where sox', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)[0];
//             if (out && fs.existsSync(out)) return out;
//         } else {
//             const out = execSync('which sox', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)[0];
//             if (out && fs.existsSync(out)) return out;
//         }
//     } catch (e) {}
//     const commonWin = 'C:\\Program Files (x86)\\sox-14-4-2\\sox.exe';
//     if (process.platform === 'win32' && fs.existsSync(commonWin)) return commonWin;
//     return 'sox';
// }

// function waitForCondition(testFn, timeout = 5000, interval = 100) {
//     const start = Date.now();
//     return new Promise((resolve) => {
//         (function poll() {
//             try {
//                 if (testFn()) return resolve(true);
//             } catch (e) {}
//             if (Date.now() - start >= timeout) return resolve(false);
//             setTimeout(poll, interval);
//         })();
//     });
// }

// function postJSONRequest(host, port, pathUrl, jsonObj, timeout = 60000) {
//     return new Promise((resolve, reject) => {
//         const payload = Buffer.from(JSON.stringify(jsonObj), 'utf8');
//         const opts = {
//             hostname: host,
//             port: port,
//             path: pathUrl,
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//                 'Content-Length': payload.length
//             },
//             timeout: timeout
//         };

//         const req = http.request(opts, (res) => {
//             let data = '';
//             res.setEncoding('utf8');
//             res.on('data', chunk => data += chunk);
//             res.on('end', () => {
//                 try {
//                     if (!data) {
//                         console.error(`Empty response received from ${pathUrl} (Status: ${res.statusCode})`);
//                         return resolve({ error: `Empty response from server (Status: ${res.statusCode})`, raw: '', status: res.statusCode });
//                     }
//                     const parsed = JSON.parse(data);
//                      if (res.statusCode && res.statusCode >= 400) {
//                          console.error(`Server error status ${res.statusCode} for ${pathUrl}:`, parsed);
//                          resolve({ ...parsed, status: res.statusCode }); // Let caller handle error content
//                      } else {
//                          resolve(parsed);
//                      }
//                 } catch (e) {
//                     console.error(`Invalid JSON received from ${pathUrl}:`, e);
//                     reject(new Error(`Invalid JSON from server: ${e.message} – raw: ${data}`));
//                 }
//             });
//         });

//         req.on('error', (err) => {
//             console.error(`HTTP request error to ${pathUrl}:`, err);
//             reject(new Error(`HTTP request failed: ${err.message || err.code}`));
//         });

//         req.on('timeout', () => {
//              console.error(`Request timeout for ${pathUrl}`);
//             req.destroy(new Error(`Request timeout after ${timeout}ms`)); // Include timeout value
//         });


//         req.write(payload);
//         req.end();
//     });
// }
// /* ----------------- Mode prompt ----------------- */
// // ... (promptForModeIfUnset unchanged) ...
// async function promptForModeIfUnset(context) {
//     const stored = context.globalState.get('vca.mode', null);
//     if (stored === 'auto' || stored === 'check') return stored;
//     // Prompt user (modal)
//     const pick = await vscode.window.showQuickPick(
//         ['Auto Write (apply automatically)', 'Check & Commit (preview before apply)'],
//         { placeHolder: 'Choose Voice Assistant mode (you can change later)', ignoreFocusOut: true }
//     );
//     let mode = 'check';
//     if (pick && pick.startsWith('Auto')) mode = 'auto';
//     await context.globalState.update('vca.mode', mode);
//     vscode.window.showInformationMessage('Voice Code Assistant mode set to: ' + (mode === 'auto' ? 'Auto Write' : 'Check & Commit'));
//     return mode;
// }
// /* ----------------- Recording & Webview ----------------- */
// // ... (createVoicePanel unchanged) ...
// async function createVoicePanel(context) {
//     // Check if panel already exists
//     if (voicePanelInstance) {
//         voicePanelInstance.reveal(vscode.ViewColumn.Beside);
//         return voicePanelInstance;
//     }

//     // Ensure user chooses mode before creating interactive webview
//     const mode = await promptForModeIfUnset(context);

//     const panel = vscode.window.createWebviewPanel(
//         'voiceCodeAssistant',
//         'Voice Code Assistant',
//         vscode.ViewColumn.Beside,
//         { enableScripts: true, retainContextWhenHidden: true }
//     );

//     panel.webview.html = getWebviewContent(mode);
//     panel._recordSession = null;

//     panel.webview.onDidReceiveMessage(async (message) => {
//          // --- Remove StopRecording Case ---
//         try {
//             switch (message.command) {
//                 case 'startRecording':
//                     startRecording(panel); // Pass panel context
//                     break;
//                 // 'stopRecording' is no longer sent from webview
//                 case 'deleteRecording':
//                     // --- Added cleanup for session ---
//                     if (panel._recordSession?.proc && !panel._recordSession.proc.killed) {
//                         try { panel._recordSession.proc.kill(); } catch (e) {} // Kill active recording if deleting
//                     }
//                     if (panel._recordSession?.outFile) {
//                         try { if(fs.existsSync(panel._recordSession.outFile)) fs.unlinkSync(panel._recordSession.outFile); } catch (e) {}
//                     }
//                     panel._recordSession = null; // Clear session state
//                     panel.webview.postMessage({ command: 'status', text: 'Deleted recording.' });
//                     panel.webview.postMessage({ command: 'transcriptionResult', text: '' });
//                     panel.webview.postMessage({ command: 'recordingStoppedUI' }); // Reset UI
//                     break;
//                 case 'setMode':
//                     if (message.mode === 'auto' || message.mode === 'check') {
//                         await context.globalState.update('vca.mode', message.mode);
//                         panel.webview.postMessage({ command: 'mode', mode: message.mode });
//                         vscode.window.showInformationMessage('Voice Code Assistant mode set to: ' + (message.mode === 'auto' ? 'Auto Write' : 'Check & Commit'));
//                     }
//                     break;
//                 case 'checkCommitAIEdits':
//                     await applyAIEditsSafe({ updatedFile: message.updatedFile, edits: null, auto: false }, panel); // Pass null for edits
//                     break;
//             }
//         } catch (err) {
//             console.error('Message handler error', err);
//             panel.webview.postMessage({ command: 'error', text: String(err.message || err) });
//              panel.webview.postMessage({ command: 'recordingStoppedUI' }); // Reset UI on error
//         }
//     }, undefined, context.subscriptions); // Pass subscriptions for disposal handling
//     panel.onDidDispose(() => {
//         if (panel._recordSession?.proc && !panel._recordSession.proc.killed) {
//             try { panel._recordSession.proc.kill(); console.log("Killed SoX process on panel dispose.");} catch (e) {}
//         }
//          // Clean up temp file on dispose if it still exists
//          if (panel._recordSession?.outFile && fs.existsSync(panel._recordSession.outFile)) {
//              try { fs.unlinkSync(panel._recordSession.outFile); console.log("Deleted temp audio file on panel dispose."); } catch (e) {}
//          }
//         voicePanelInstance = null; // Clear global reference
//         panel._recordSession = null; // Ensure session is cleared
//     }, null, context.subscriptions);
//     panel.webview.postMessage({ command: 'mode', mode: mode });
//     voicePanelInstance = panel; // Set global reference
//     return panel;
// }

// function startRecording(panel) {
//     // --- UPDATED with new SoX params and robust checks ---
//     if (!panel || !panel.webview) {
//         console.error("startRecording: Invalid panel state.");
//         return;
//     }
//     if (panel._recordSession && panel._recordSession.recording) {
//         panel.webview.postMessage({ command: 'status', text: 'Already recording.' });
//         return;
//     }
//     console.log("Starting recording...");

//     const soxExe = getSoxExecutable();
//     if (soxExe !== 'sox' && !fs.existsSync(soxExe)) {
//         panel.webview.postMessage({ command: 'error', text: `SoX not found at "${soxExe}". Set SOX_PATH or add sox to PATH.` });
//         return;
//     }

//     const outFile = path.join(os.tmpdir(), `vca_record_${Date.now()}.wav`);

//     // --- ADJUSTED SoX PARAMS ---
//     // Added pad 0.1 0: Adds 0.1s silence before processing starts (helps catch start of speech)
//     // Adjusted silence params: silence [above_periods duration threshold%] [below_periods duration threshold%]
//     //   1 0.2 1% : Trigger detection after 0.2s of sound above 1% volume
//     //   1 1.0 1% : Stop recording after 1.0s of sound below 1% volume
//     const args = [
//         '-t', 'waveaudio', 'default', // Input device
//         '-r', '16000', '-c', '1',    // Sample rate and channels
//         outFile,                     // Output file
//         'pad', '0.1', '0',           // Add 0.1s padding at start
//         'silence', '1', '0.2', '1%', // Sound detection: wait for 1 period of 0.2s above 1%
//         '1', '1.0', '1%'             // Silence detection: stop after 1 period of 1.0s below 1%
//     ];
//     // --- (Alternative Threshold: Try 0.5% if 1% is still not sensitive enough) ---
//     // const args = [... '-t', 'waveaudio', ..., outFile, 'pad', '0.1', '0', 'silence', '1', '0.2', '0.5%', '1', '1.0', '0.5%'];

//     console.log(`Spawning SoX: ${soxExe} ${args.join(' ')}`);

//     let proc;
//     try {
//         proc = spawn(soxExe, args, { windowsHide: true });
//         // Set session immediately
//         panel._recordSession = { proc, outFile, recording: true, closed: false };
//         console.log("SoX process spawned, PID:", proc.pid);
//     } catch (err) {
//         console.error('Failed to spawn SoX:', err);
//         panel.webview.postMessage({ command: 'error', text: 'Failed to spawn SoX: ' + err.message });
//         panel._recordSession = null; // Clear session
//         return;
//     }

//     let soxErrOutput = '';
//     proc.stderr.on('data', (data) => {
//         const errText = data.toString();
//         console.log("SoX stderr:", errText); // Log stderr output
//         soxErrOutput += errText;
//     });

//     proc.on('error', (err) => {
//         console.error('SoX process error event:', err);
//         if (panel?.webview) { // Check if panel still exists
//             panel.webview.postMessage({ command: 'error', text: 'SoX process error: ' + err.message });
//             panel.webview.postMessage({ command: 'recordingStoppedUI' });
//         }
//         if (panel) panel._recordSession = null; // Clear session
//     });

//     proc.on('close', (code, signal) => {
//         console.log(`SoX process close event (code=${code}, signal=${signal})`);
//         // Crucial check: Only proceed if the panel and its session are still valid
//         if (!panel || !panel._recordSession) {
//             console.log("SoX closed, but panel/session is invalid. Ignoring.");
//             // Attempt cleanup if outFile path is known somehow, but risky
//             return;
//         }

//         panel._recordSession.closed = true;

//         if (code !== 0 && soxErrOutput) {
//             console.warn(`SoX exited with code ${code}. Stderr: ${soxErrOutput}`);
//             // Don't necessarily treat non-zero exit as fatal error for silence detection
//             // It might indicate input stopped before silence duration, which is OK.
//         }

//         // --- Automatically trigger processing ---
//         // Check recording flag to prevent double processing
//         if (panel._recordSession.recording) {
//             console.log("SoX closed naturally (likely silence). Triggering processing...");
//             // Mark as not recording *before* the timeout to prevent race conditions
//             panel._recordSession.recording = false;
//             setTimeout(() => {
//                  // Check panel validity *again* before calling stopRecordingAndSend
//                 if (voicePanelInstance === panel && panel._recordSession != null) { // Use != null to check for both null and undefined
//                     stopRecordingAndSend(panel, extensionContext);
//                  } else {
//                      console.log("Panel mismatch or session cleared after SoX close timeout, skipping processing.");
//                      // Ensure UI is reset if processing is skipped here
//                      if(panel?.webview) panel.webview.postMessage({ command: 'recordingStoppedUI' });
//                  }
//             }, 300); // Delay for file write completion
//         } else {
//             console.log("SoX closed, but recording flag already false (likely manual stop/error).");
//              // Ensure UI is reset even if stop was called manually/errored before
//              if (panel?.webview) panel.webview.postMessage({ command: 'recordingStoppedUI' });
//         }
//     });

//     // Update UI
//     panel.webview.postMessage({ command: 'status', text: '🎤 Recording... (stops automatically on silence)' });
//     panel.webview.postMessage({ command: 'recordingStartedUI' });
// }


// async function stopRecordingAndSend(panel, context) {
//     // --- UPDATED: More robust checks and cleanup ---
//     const s = panel?._recordSession;

//     if (!s || s.stoppedProcessing) { // Add flag to prevent re-entry
//         console.log("stopRecordingAndSend called but session invalid or already processed. Exiting.");
//         if (panel?.webview) panel.webview.postMessage({ command: 'recordingStoppedUI' });
//         return;
//     }
//     console.log("Executing stopRecordingAndSend...");
//     s.stoppedProcessing = true; // Mark that processing has started

//     // Ensure recording flag is false (might be set by 'close' handler already)
//     s.recording = false;

//     // Kill process ONLY if it wasn't closed naturally (manual stop scenario - though less likely now)
//     // And check if proc exists and hasn't exited
//     if (s.proc && !s.closed && !s.proc.killed && s.proc.exitCode === null) {
//         try {
//             console.log("Manually stopping SoX process (should be rare)...");
//             s.proc.kill();
//             await waitForCondition(() => s.closed === true, 1000, 50); // Shorter wait after manual kill
//         } catch (e) {
//             console.error("Error killing SoX:", e);
//         }
//     } else {
//          // If already closed, just wait a moment for file finalization
//          await new Promise(resolve => setTimeout(resolve, 100));
//     }


//     const outFile = s.outFile; // Store path before potentially nullifying session

//     try {
//         if (!outFile || !fs.existsSync(outFile)) {
//             console.error('Recording file not found:', outFile);
//             if (panel?.webview) panel.webview.postMessage({ command: 'error', text: 'Recording file not found.' });
//             return;
//         }

//         const stats = fs.statSync(outFile);
//         if (stats.size < 100) {
//             console.error('Recorded file too small:', outFile, 'Size:', stats.size);
//             if (panel?.webview) panel.webview.postMessage({ command: 'error', text: 'Recorded audio seems empty.' });
//             // Clean up small/empty file happens in finally block
//             return;
//         }
//         console.log(`Reading recording file: ${outFile} (${stats.size} bytes)`);

//         const buff = fs.readFileSync(outFile); // Read before potential deletion
//         const base64 = buff.toString('base64');
//         if (panel?.webview) {
//              panel.webview.postMessage({ command: 'recordingSaved', filename: path.basename(outFile), data: base64 });
//              panel.webview.postMessage({ command: 'status', text: `Processing recording...` });
//         }

//         // --- Transcription ---
//         if (panel?.webview) {
//              panel.webview.postMessage({ command: 'status', text: 'Transcribing...' });
//              panel.webview.postMessage({ command: 'transcriptionResult', text: '...' });
//         }
//         let transcriptText = '';
//         try {
//             console.log("Sending transcription request...");
//             const resp = await postJSONRequest('127.0.0.1', 8000, '/transcribe', { filename: path.basename(outFile), data: base64 }, 120000);

//             if (resp?.error) throw new Error(resp.error); // Handle server error
//             if (typeof resp?.text !== 'string') throw new Error('No text in transcription response');

//             transcriptText = resp.text.trim();
//             console.log("Transcription successful:", transcriptText);
//              if (panel?.webview) {
//                  panel.webview.postMessage({ command: 'transcriptionResult', text: transcriptText });
//                  panel.webview.postMessage({ command: 'status', text: 'Transcription complete.' });
//             }

//         } catch (err) {
//             console.error('Transcription failed:', err);
//              if (panel?.webview) {
//                  panel.webview.postMessage({ command: 'transcriptionResult', text: '' });
//                  panel.webview.postMessage({ command: 'error', text: 'Transcription failed: ' + err.message });
//              }
//             playAudioFeedback("Sorry, I couldn't transcribe that.");
//             return; // Stop if transcription fails
//         }
//         // --- Suggestion ---
//         if (transcriptText) {
//             let editor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0];
//             if (editor?.document) {
//                 const fileContent = editor.document.getText();
//                 const fileName = path.basename(editor.document.fileName || 'untitled');
//                  if (panel?.webview) panel.webview.postMessage({ command: 'status', text: 'Asking AI...' });
//                  console.log("Sending suggestion request...");

//                 try {
//                     const suggestResp = await postJSONRequest('127.0.0.1', 8000, '/suggest', { filename: fileName, transcript: transcriptText, file_content: fileContent }, 120000);

//                     if (suggestResp?.error) throw new Error(suggestResp.error);
//                     if (typeof suggestResp?.summary !== 'string') throw new Error('Invalid suggestion response structure');

//                     console.log("Suggestion successful:", suggestResp.summary);
//                      if (panel?.webview) {
//                          panel.webview.postMessage({ command: 'aiSuggestions', summary: suggestResp.summary, updated_file: suggestResp.updated_file, raw: suggestResp.raw });
//                      }

//                     playAudioFeedback(suggestResp.summary);

//                     const mode = context.globalState.get('vca.mode', 'check');
//                     const hasEdits = typeof suggestResp.updated_file === 'string';

//                     if (!hasEdits) {
//                          if (panel?.webview) panel.webview.postMessage({ command: 'status', text: suggestResp.summary || 'AI: No changes needed.' });
//                     } else if (mode === 'auto') {
//                         await applyAIEditsSafe({ updatedFile: suggestResp.updated_file, auto: true }, panel);
//                     } else {
//                          if (panel?.webview) panel.webview.postMessage({ command: 'status', text: suggestResp.summary || 'AI suggestions received. Review and commit.' });
//                     }
//                 } catch (err) {
//                     console.error('Suggestion failed:', err);
//                      if (panel?.webview) panel.webview.postMessage({ command: 'error', text: 'Suggestion failed: ' + err.message });
//                     playAudioFeedback("Sorry, I couldn't get suggestions.");
//                 }
//             } else {
//                  console.log("No active editor for suggestion.");
//                  if (panel?.webview) panel.webview.postMessage({ command: 'status', text: 'No active editor found.' });
//                 playAudioFeedback("Please open a file first.");
//             }
//         } else {
//              console.log("Empty transcription, skipping suggestion.");
//              if (panel?.webview) panel.webview.postMessage({ command: 'status', text: 'No speech detected.' });
//              playAudioFeedback("I didn't hear anything clearly.");
//         }

//     } catch (err) {
//         console.error('Error during stopRecordingAndSend processing:', err);
//          if (panel?.webview) {
//              panel.webview.postMessage({ command: 'error', text: 'Error processing recording: ' + err.message });
//          }
//          playAudioFeedback("An error occurred processing the recording.");
//     } finally {
//         // --- Final Cleanup & UI Reset ---
//         console.log("Running finally block in stopRecordingAndSend...");
//         // Clean up temp file regardless of success/failure above
//         if (outFile && fs.existsSync(outFile)) {
//             try {
//                 fs.unlinkSync(outFile);
//                 console.log("Deleted temp audio file in finally block:", outFile);
//             } catch (e) {
//                 console.error("Failed to delete temp audio file in finally block:", e);
//             }
//         }
//         // Clear session state on the panel object IF it still exists
//         if (panel) {
//             panel._recordSession = null;
//         }
//         // Ensure UI state is reset
//         if (panel?.webview) {
//             panel.webview.postMessage({ command: 'recordingStoppedUI' });
//         }
//         console.log("stopRecordingAndSend finished.");
//     }
// }


// /* ----------------- Apply edits & validation ----------------- */
// // ... (applyAIEditsSafe unchanged, relies on playAudioFeedback) ...
// async function applyAIEditsSafe(message, panel) {
//     // ... (This function is largely unchanged, relies on playAudioFeedback, added formatting)
//     try {
//         const updatedFile = message.updatedFile || null; // Use null if undefined
//         const autoMode = !!message.auto;

//         const editor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0];
//         if (!editor) {
//              vscode.window.showErrorMessage('No active editor to apply changes.');
//              playAudioFeedback("I can't apply changes, no editor is active.");
//              return;
//          }
//         const doc = editor.document;
//         const originalText = doc.getText();

//         if (updatedFile === null) {
//              const msg = "AI did not provide updated file content.";
//              if (panel?.webview) panel.webview.postMessage({ command: 'status', text: msg });
//              vscode.window.showInformationMessage(msg);
//              playAudioFeedback(msg);
//              return;
//          }

//         if (updatedFile === originalText) {
//             const msg = "AI suggested no changes (result equals current file).";
//             vscode.window.showInformationMessage(msg);
//              playAudioFeedback(msg);
//             return;
//         }

//         let newText = updatedFile;

//         const ext = path.extname(doc.fileName || '').toLowerCase();
//         const langId = (doc.languageId || '').toLowerCase();
//         const isBraceLang = isBraceLanguage(doc);

//         if (isBraceLang) {
//             const { fixedText, fixed } = tryFixBraceBalance(newText);
//             if (fixed) { console.log("Applied brace fix."); newText = fixedText; }
//         }

//         const validatorInfo = getValidatorForLang(ext, langId);
//         let validationResult = { available: false };
//         if (validatorInfo) {
//             if (panel?.webview) panel.webview.postMessage({ command: 'status', text: 'Validating...' });
//             try {
//                 validationResult = await runLanguageValidation(validatorInfo, newText);
//             } catch (e) {
//                 validationResult = { available: false, errorMessage: String(e) };
//             }
//         }

//         if (autoMode) {
//             if (validationResult.available && !validationResult.ok) {
//                 const msg = `Auto Write blocked: validation failed: ${validationResult.errorMessage || 'syntax errors'}`;
//                 const choice = await vscode.window.showErrorMessage(msg, { modal: true }, 'Show errors', 'Cancel');
//                 playAudioFeedback("Auto Write blocked due to validation errors.");
//                  if (choice === 'Show errors') {
//                      const errDoc = await vscode.workspace.openTextDocument({ content: validationResult.fullOutput || validationResult.stderr || 'No details', language: 'text' });
//                      await vscode.window.showTextDocument(errDoc, { preview: true });
//                  }
//             } else {
//                 await applyWholeFile(doc, newText);
//                  // --- Auto Format ---
//                  await vscode.commands.executeCommand('editor.action.formatDocument');
//                 // Summary already spoken by AI
//             }
//             return;
//         }

//         // Check & Commit
//         if (validationResult.available && !validationResult.ok) {
//             const msg = `Validation failed: ${validationResult.errorMessage || validationResult.stderr || 'syntax errors'}`;
//             playAudioFeedback("Validation failed.");
//             const choice = await vscode.window.showErrorMessage(msg, { modal: true }, 'Preview anyway', 'Show errors', 'Cancel');
//             if (choice === 'Show errors') {
//                  const errDoc = await vscode.workspace.openTextDocument({ content: validationResult.fullOutput || validationResult.stderr || 'No details', language: 'text' });
//                  await vscode.window.showTextDocument(errDoc, { preview: true });
//                  return;
//              }
//             if (choice === 'Cancel' || !choice) return;
//         }

//         const autoNote = validationResult.available ? (validationResult.ok ? ' (validated ok)' : ' (validation errors)') : ' (no validator)';
//         const choice = await vscode.window.showWarningMessage(`AI suggests changes.${autoNote} Preview or apply?`, { modal: true }, 'Preview changes', 'Apply changes', 'Cancel');
//         if (choice === 'Cancel' || !choice) return;

//         if (choice === 'Preview changes') {
//             const lang = doc.languageId;
//             const newDoc = await vscode.workspace.openTextDocument({ content: newText, language: lang });
//             await vscode.commands.executeCommand('vscode.diff', doc.uri, newDoc.uri, `AI Preview — ${path.basename(doc.fileName || 'untitled')}`);
//             const after = await vscode.window.showWarningMessage('Apply AI suggested changes?', 'Apply', 'Cancel');
//             if (after !== 'Apply') return;
//         }

//         await applyWholeFile(doc, newText);
//          // --- Auto Format ---
//          await vscode.commands.executeCommand('editor.action.formatDocument');
//         // Summary already spoken by AI

//     } catch (err) {
//         console.error('applyAIEditsSafe error:', err);
//         vscode.window.showErrorMessage('Failed to apply edits: ' + err.message);
//         playAudioFeedback("Failed to apply edits.");
//     }
// }
// async function applyWholeFile(doc, newText) {
//      console.log("Applying whole file update...");
//     const fullRange = new vscode.Range(new vscode.Position(0, 0), doc.lineAt(doc.lineCount - 1).range.end); // More accurate range
//     const wsEdit = new vscode.WorkspaceEdit();
//     wsEdit.replace(doc.uri, fullRange, newText);
//     const success = await vscode.workspace.applyEdit(wsEdit);
//      if (!success) {
//          console.error('WorkspaceEdit.applyEdit failed');
//          throw new Error('Failed to apply workspace edit.');
//      }
//      console.log("Whole file update applied successfully.");
//      // Save the document after applying edits
//      await doc.save();
//      console.log("Document saved after applying edits.");
// }


// /* ----------------- Edit helpers & brace-fixer ----------------- */
// // ... (applyEditsToText, isBraceLanguage, tryFixBraceBalance unchanged) ...
// function applyEditsToText(text, edits) {
//     // ... (This function is unchanged)
//     const origLines = text.replace(/\r\n/g, '\n').split('\n');
//     const normalized = (edits || []).map(e => {
//         const start_line = (typeof e.start_line === 'number') ? e.start_line : ((typeof e.start === 'number') ? e.start : 1);
//         const end_line = (typeof e.end_line === 'number') ? e.end_line : ((typeof e.end === 'number') ? e.end : start_line);
//         const new_text = (e.new_text != null) ? String(e.new_text) : (e.text != null ? String(e.text) : '');
//         return { start_line, end_line, new_text };
//     });
//     normalized.sort((a, b) => b.start_line - a.start_line);

//     let lines = origLines.slice();
//     for (const ed of normalized) {
//         const s = Math.max(1, Math.min(ed.start_line, lines.length + 1));
//         const e = Math.max(1, Math.min(ed.end_line, lines.length));
//         const si = s - 1;
//         const ei = Math.max(si, e - 1);
//         const newLines = ed.new_text.replace(/\r\n/g, '\n').split('\n');
//         if (si > lines.length) {
//             while (lines.length < si) lines.push('');
//             lines = lines.concat(newLines);
//         } else {
//             const before = lines.slice(0, si);
//             const after = lines.slice(ei + 1);
//             lines = before.concat(newLines).concat(after);
//         }
//     }
//     return lines.join('\n');
// }

// function isBraceLanguage(doc) {
//     // ... (This function is unchanged)
//     const ext = path.extname(doc.fileName || '').toLowerCase();
//     const langId = (doc.languageId || '').toLowerCase();

//     const braceExts = ['.js', '.jsx', '.ts', '.tsx', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.swift', '.kt', '.kts'];
//     const braceLangIds = ['javascript', 'typescript', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'swift', 'kotlin'];

//     if (braceExts.includes(ext)) return true;
//     for (const id of braceLangIds) {
//         if (langId.includes(id)) return true;
//     }
//     return false;
// }

// function tryFixBraceBalance(text) {
//     // ... (This function is unchanged)
//     const openCount = (text.match(/\{/g) || []).length;
//     const closeCount = (text.match(/\}/g) || []).length;
//     let diff = closeCount - openCount;
    
//     if (diff <= 0) {
//         return { fixedText: text, fixed: false };
//     }

//     let lines = text.replace(/\r\n/g, '\n').split('\n');
//     let fixed = false;

//     for (let i = lines.length - 1; i >= 0 && diff > 0; i--) {
//         const trimmed = lines[i].trim();
//         if (trimmed === '}' || trimmed === '};' || trimmed === '},') {
//             lines.splice(i, 1);
//             diff--;
//             fixed = true;
//         }
//     }
    
//     if (diff > 0) {
//         for (let i = lines.length - 1; i >= 0 && diff > 0; i--) {
//             let line = lines[i];
//             let removed = 0;
//             while (line.trim().endsWith('}') && diff > 0) {
//                 line = line.replace(/}\s*$/, '');
//                 diff--;
//                 removed++;
//             }
//             if (removed > 0) {
//                 lines[i] = line;
//                 fixed = true;
//             }
//         }
//     }
//     return { fixedText: lines.join('\n'), fixed };
// }
// /* ----------------- Language validation ----------------- */
// // ... (getValidatorForLang, runLanguageValidation, inferExtensionFromValidator unchanged) ...
// function getValidatorForLang(ext, langId) {
//     // ... (This function is unchanged)
//     const map = [
//         { match: (e, l) => e === '.py' || l.includes('python'), name: 'Python (py_compile)', cmd: 'python', args: (p) => ['-m', 'py_compile', p] },
//         { match: (e, l) => e === '.js' || l.includes('javascript'), name: 'Node (syntax check)', cmd: 'node', args: (p) => ['--check', p] },
//         { match: (e, l) => e === '.ts' || l.includes('typescript'), name: 'TypeScript (tsc)', cmd: 'tsc', args: (p) => ['--noEmit', '--skipLibCheck', p] },
//         { match: (e, l) => e === '.java' || l.includes('java'), name: 'Java (javac)', cmd: 'javac', args: (p) => [p] },
//         { match: (e, l) => e === '.c' || l.includes('c'), name: 'C (gcc -fsyntax-only)', cmd: 'gcc', args: (p) => ['-fsyntax-only', p] },
//         { match: (e, l) => e === '.cpp' || e === '.cc' || e === '.cxx' || l.includes('cpp') || l.includes('c++'), name: 'C++ (g++ -fsyntax-only)', cmd: 'g++', args: (p) => ['-fsyntax-only', p] }
//     ];
//     for (const m of map) if (m.match(ext, langId)) return { name: m.name, cmd: m.cmd, argsFn: m.args };
//     return null;
// }

// function runLanguageValidation(validatorInfo, text, timeoutMs = 15000) {
//     // ... (This function is unchanged)
//     return new Promise((resolve) => {
//         const tmpdir = os.tmpdir();
//         const ext = inferExtensionFromValidator(validatorInfo.cmd) || '.tmp';
//         const tmpPath = path.join(tmpdir, `vca_validate_${Date.now()}${ext}`);

//         try {
//             fs.writeFileSync(tmpPath, text, 'utf8');
//         } catch (e) {
//             return resolve({ available: false, ok: false, errorMessage: 'Failed to write temp file: ' + String(e) });
//         }

//         const args = validatorInfo.argsFn(tmpPath);
//         const cmd = validatorInfo.cmd;

//         const child = spawn(cmd, args, { windowsHide: true, shell: true });
//         let stdout = '';
//         let stderr = '';
//         let finished = false;

//         const killTimer = setTimeout(() => {
//             if (!finished) {
//                 try { child.kill(); } catch (e) {}
//                 finished = true;
//                 try { fs.unlinkSync(tmpPath); } catch (e) {}
//                 return resolve({ available: false, ok: false, errorMessage: 'Validation timed out' });
//             }
//         }, timeoutMs);

//         child.stdout.on('data', d => stdout += d.toString());
//         child.stderr.on('data', d => stderr += d.toString());
//         child.on('error', (err) => {
//             if (finished) return;
//             clearTimeout(killTimer);
//             finished = true;
//             try { fs.unlinkSync(tmpPath); } catch (e) {}
//             if (err.code === 'ENOENT') {
//                 return resolve({ available: false, ok: false, errorMessage: `Validator command not found: ${cmd}. Is it in your PATH?` });
//             }
//             return resolve({ available: false, ok: false, errorMessage: String(err) });
//         });

//         child.on('close', (code) => {
//             if (finished) return;
//             clearTimeout(killTimer);
//             finished = true;
//             try { fs.unlinkSync(tmpPath); } catch (e) {}
//             if (code === 0) {
//                 return resolve({ available: true, ok: true, stdout, stderr, fullOutput: stdout + stderr });
//             } else {
//                 const out = stdout + stderr;
//                 return resolve({ available: true, ok: false, stdout, stderr, fullOutput: out, errorMessage: out || `exit code ${code}` });
//             }
//         });
//     });
// }

// function inferExtensionFromValidator(cmd) {
//     // ... (This function is unchanged)
//     if (cmd === 'python') return '.py';
//     if (cmd === 'node') return '.js';
//     if (cmd === 'tsc') return '.ts';
//     if (cmd === 'javac') return '.java';
//     if (cmd === 'gcc') return '.c';
//     if (cmd === 'g++') return '.cpp';
//     return '.txt';
// }
// /* ----------------- Webview content ----------------- */

// function getWebviewContent(storedMode) {
//     // --- UPDATED: Removed stopBtn, added UI handlers ---
//     const initialMode = storedMode || 'unset';
//     return `<!DOCTYPE html>
// <html lang="en">
// <head>
// <meta charset="utf-8" />
// <meta name="viewport" content="width=device-width,initial-scale=1" />
// <title>Voice Capture</title>
// <style>
//     body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial; padding: 18px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
//     button { padding:8px 12px; margin-right:8px; border-radius:6px; border:none; cursor:pointer; transition: background-color 0.2s ease; }
//     .start{ background:var(--vscode-button-background); color:var(--vscode-button-foreground); }
//     .start:hover { background: var(--vscode-button-hoverBackground); }
//     /* Removed .stop style */
//     .auto{ background:#27ae60; color:white; }
//     .check{ background:#2d8cf0; color:white; }
//     .stop-speak { background: #f39c12; color: white; margin-left: 15px;}
//     button:disabled { background: var(--vscode-disabledForeground); color: var(--vscode-editor-background); cursor: default; opacity: 0.6; } /* Improved disabled style */

//     #status{ margin-top:12px; padding:10px; border-radius:6px; background:var(--vscode-input-background); border:1px solid var(--vscode-input-border); min-height:48px; display:flex; align-items:center; transition: background-color 0.3s ease;}
//     #status.recording { background-color: rgba(231, 76, 60, 0.2); } /* Subtle recording indicator */
//     #status.processing { background-color: rgba(45, 140, 240, 0.15); } /* Processing indicator */


//     audio{ width:100%; margin-top:12px; }
//     #transcription{ margin-top:12px; padding:12px; border-radius:6px; background:rgba(0,0,0,0.03); white-space:pre-wrap; min-height:80px; border:1px solid var(--vscode-input-border); }
//     #aiBox{ margin-top:12px; padding:12px; border-radius:6px; background:rgba(0,0,0,0.02); border:1px dashed var(--vscode-input-border); }
//     pre{ white-space:pre-wrap; word-break:break-word; max-height:300px; overflow:auto; background: var(--vscode-input-background); padding: 8px; border-radius: 4px;}
//     .btnRow{ margin-top:10px; }
//     #modeLabel { margin-left:8px; font-weight:600; }
// </style>
// </head>
// <body>
//     <h3>🎤 Voice Capture (SoX → Whisper → Gemini)</h3>
//     <div>
//         <button id="startBtn" class="start">Start Recording</button>
//         <button id="deleteBtn" disabled>Delete Recording</button>
//         <span id="modeLabel">Mode: ${initialMode === 'unset' ? 'Not set' : (initialMode === 'auto' ? 'Auto Write' : 'Check & Commit')}</span>
//         <button id="stopSpeakBtn" class="stop-speak" style="display:none;">Stop Speaking 🔇</button>
//     </div>

//     <div id="status">Press Start to record (stops on silence).</div>

//     <audio id="player" controls hidden></audio> <audio id="audioPlayer" style="display:none;"></audio> <div id="transcription">Transcription will appear here after processing.</div>

//     <div id="aiBox" hidden>
//         <h4>AI suggestions</h4>
//         <div id="aiSummary"></div>
//         <pre id="aiRaw" style="display:none;"></pre>
//         <button id="commitBtn" class="check" style="display:none; margin-top: 10px;">Check & Commit Changes</button>
//         <div class="btnRow" style="margin-top: 20px; border-top: 1px solid var(--vscode-input-border); padding-top: 10px;">
//             <button id="autoBtn" class="auto">Set Auto Write</button>
//             <button id="checkBtn" class="check">Set Check & Commit</button>
//         </div>
//         <div style="margin-top:8px;color:var(--vscode-descriptionForeground)">Auto Write applies changes automatically. Check & Commit allows review first.</div>
//     </div>

// <script>
//     const vscode = acquireVsCodeApi();
//     const startBtn = document.getElementById('startBtn');
//     const deleteBtn = document.getElementById('deleteBtn');
//     const statusDiv = document.getElementById('status');
//     const player = document.getElementById('player');
//     const transcriptionDiv = document.getElementById('transcription');
//     const aiBox = document.getElementById('aiBox');
//     const aiSummary = document.getElementById('aiSummary');
//     const aiRaw = document.getElementById('aiRaw');
//     const autoBtn = document.getElementById('autoBtn');
//     const checkBtn = document.getElementById('checkBtn');
//     const modeLabel = document.getElementById('modeLabel');
//     const commitBtn = document.getElementById('commitBtn');
//     const audioPlayer = document.getElementById('audioPlayer');
//     const stopSpeakBtn = document.getElementById('stopSpeakBtn');

//     let latestAI = null;
//     let currentMode = '${initialMode}';

//     function resetUIState() {
//         console.log("Resetting UI state");
//         startBtn.disabled = false;
//         // Keep delete enabled only if a recording was successfully saved and is visible
//         deleteBtn.disabled = player.hidden || !player.src;
//         statusDiv.textContent = 'Press Start to record (stops on silence).';
//         statusDiv.classList.remove('recording', 'processing');
//         // Don't clear transcription or AI box here, let new results overwrite
//     }


//     startBtn.addEventListener('click', () => {
//         vscode.postMessage({ command: 'startRecording' });
//         startBtn.disabled = true;
//         deleteBtn.disabled = true;
//         statusDiv.textContent = 'Starting recording...';
//         statusDiv.classList.add('recording'); // Add recording class
//         statusDiv.classList.remove('processing');
//         player.hidden = true; player.src = ''; // Hide old recording
//         transcriptionDiv.textContent = ''; aiBox.hidden = true; latestAI = null; commitBtn.style.display = 'none';
//         stopSpeakBtn.style.display = 'none'; audioPlayer.pause(); audioPlayer.src = '';
//     });

//     // deleteBtn listener now calls resetUIState implicitly via recordingStoppedUI message
//     deleteBtn.addEventListener('click', () => {
//         vscode.postMessage({ command: 'deleteRecording' });
//         // UI updates will happen via 'recordingStoppedUI' and status/error messages
//         player.hidden = true; player.src = ''; // Immediately hide player
//         deleteBtn.disabled = true; // Immediately disable delete
//         transcriptionDiv.textContent = ''; // Clear transcription
//         aiBox.hidden = true; // Hide AI box
//     });

//     autoBtn.addEventListener('click', () => vscode.postMessage({ command: 'setMode', mode: 'auto' }));
//     checkBtn.addEventListener('click', () => vscode.postMessage({ command: 'setMode', mode: 'check' }));

//     commitBtn.addEventListener('click', () => {
//         if (latestAI) {
//             vscode.postMessage({ command: 'checkCommitAIEdits', updatedFile: latestAI.updated_file, edits: null });
//             commitBtn.style.display = 'none';
//             statusDiv.textContent = 'Applying changes...';
//              statusDiv.classList.add('processing');
//         }
//     });

//     stopSpeakBtn.addEventListener('click', () => {
//         console.log('Stop speak clicked'); audioPlayer.pause(); audioPlayer.currentTime = 0; audioPlayer.src = ''; stopSpeakBtn.style.display = 'none';
//     });

//     audioPlayer.addEventListener('play', () => { console.log('Audio playing'); stopSpeakBtn.style.display = 'inline-block'; });
//     audioPlayer.addEventListener('ended', () => { console.log('Audio ended'); stopSpeakBtn.style.display = 'none'; });
//     audioPlayer.addEventListener('pause', () => { console.log('Audio paused'); if (!audioPlayer.src || audioPlayer.currentTime === 0 || audioPlayer.ended) { stopSpeakBtn.style.display = 'none'; } });
//     audioPlayer.addEventListener('error', (e) => { console.error('Audio error:', e); statusDiv.textContent = 'Error playing audio.'; stopSpeakBtn.style.display = 'none'; });

//     window.addEventListener('message', event => {
//         const msg = event.data;
//         console.log('Webview received message:', msg.command, msg.text || ''); // Log text for status/error
//         switch (msg.command) {
//             case 'status':
//                  statusDiv.textContent = msg.text;
//                  // Add/remove processing class based on status text
//                  if (msg.text?.toLowerCase().includes('processing') || msg.text?.toLowerCase().includes('transcribing') || msg.text?.toLowerCase().includes('asking ai')) {
//                      statusDiv.classList.add('processing');
//                      statusDiv.classList.remove('recording');
//                  } else if (!msg.text?.toLowerCase().includes('recording')) { // Avoid removing if status is still about recording
//                      statusDiv.classList.remove('processing');
//                  }
//                  // Remove recording class if status indicates completion or processing
//                  if (!msg.text?.toLowerCase().includes('recording...')) {
//                      statusDiv.classList.remove('recording');
//                  }
//                 break;
//             case 'error':
//                 statusDiv.textContent = 'Error: ' + msg.text;
//                 statusDiv.classList.remove('recording', 'processing'); // Clear status indicators on error
//                 resetUIState(); // Reset buttons fully on error
//                 break;
//              case 'recordingStartedUI':
//                  startBtn.disabled = true;
//                  deleteBtn.disabled = true;
//                  statusDiv.classList.add('recording');
//                  statusDiv.classList.remove('processing');
//                  break;
//              case 'recordingStoppedUI':
//                  resetUIState(); // Use central reset function
//                  break;
//             case 'recordingSaved':
//                  // Status might be set to 'Processing...' by extension, don't overwrite immediately
//                  // statusDiv.textContent = 'Recording ready: ' + msg.filename;
//                  player.src = 'data:audio/wav;base64,' + msg.data;
//                  player.hidden = false;
//                  deleteBtn.disabled = false; // Enable delete now
//                 break;
//             case 'transcriptionResult':
//                 transcriptionDiv.textContent = msg.text || '(Transcription empty)'; // Indicate if empty
//                 break;
//             case 'aiSuggestions':
//                  latestAI = { summary: msg.summary, updated_file: msg.updated_file, raw: msg.raw };
//                  aiSummary.textContent = msg.summary || 'AI processed the request.';
//                  aiRaw.textContent = msg.raw || ''; aiRaw.style.display = msg.raw ? 'block' : 'none'; aiBox.hidden = false;
//                  const hasEdits = !!latestAI.updated_file;
//                  commitBtn.style.display = (hasEdits && currentMode === 'check') ? 'inline-block' : 'none';
//                  statusDiv.classList.remove('processing'); // Processing done
//                 break;
//             case 'mode':
//                 currentMode = msg.mode || currentMode;
//                 modeLabel.textContent = 'Mode: ' + (currentMode === 'auto' ? 'Auto Write' : (currentMode === 'check' ? 'Check & Commit' : 'Not set'));
//                 const hasEditsOnModeChange = (latestAI && latestAI.updated_file);
//                 commitBtn.style.display = (hasEditsOnModeChange && currentMode === 'check') ? 'inline-block' : 'none';
//                 break;
//             case 'playAudio':
//                  console.log('Received playAudio command in webview.');
//                  audioPlayer.pause(); audioPlayer.src = '';
//                  setTimeout(() => {
//                      try {
//                           console.log('Setting audio source...');
//                           audioPlayer.src = msg.data;
//                           audioPlayer.playbackRate = 1.3; // Speed
//                           console.log('Attempting to play audio...');
//                           const playPromise = audioPlayer.play();
//                           if (playPromise) {
//                               playPromise
//                                  .then(() => console.log("Audio play initiated."))
//                                  .catch(error => {
//                                       console.error("Audio play() failed:", error);
//                                       // Log specific error details if available
//                                       if(error.name === 'NotAllowedError') {
//                                            console.warn("Autoplay was prevented. User interaction likely needed.");
//                                            statusDiv.textContent = "Audio blocked. Click panel maybe?";
//                                       } else {
//                                            statusDiv.textContent = "Audio playback error.";
//                                       }
//                                       stopSpeakBtn.style.display = 'none'; // Ensure button hidden on error
//                                   });
//                           } else {
//                                console.warn("audioPlayer.play() did not return a promise.");
//                                // Some older environments might not return a promise
//                                // Button visibility handled by event listeners anyway
//                           }
//                      } catch (e) {
//                           console.error("Error setting src or playing audio:", e);
//                           statusDiv.textContent = "Error setting up audio playback.";
//                           stopSpeakBtn.style.display = 'none';
//                      }
//                  }, 100); // Increased delay slightly more
//                  break;
//         }
//     });
// </script>
// </body>
// </html>`;
// }


// /* ----------------- Code Action Provider ----------------- */
// // ... (SelectionActionProvider unchanged) ...
// class SelectionActionProvider {
//     provideCodeActions(document, range, context, token) {
//         if (range.isEmpty) return undefined;

//         const validateAction = new vscode.CodeAction('Ask AI: Validate/Improve Selection', vscode.CodeActionKind.RefactorRewrite);
//         validateAction.command = { command: 'code-assistant.validateSelection', title: 'Ask AI: Validate/Improve Selection' };

//         const explainAction = new vscode.CodeAction('Ask AI: Explain Selection', vscode.CodeActionKind.Refactor);
//         explainAction.command = { command: 'code-assistant.explainSelection', title: 'Ask AI: Explain Selection' };

//         const testAction = new vscode.CodeAction('Ask AI: Generate Unit Test', vscode.CodeActionKind.Refactor);
//         testAction.command = { command: 'code-assistant.generateTest', title: 'Ask AI: Generate Unit Test' };

//         return [validateAction, explainAction, testAction];
//     }
// }
// /* ----------------- Commands for selection ----------------- */
// // ... (validateSelection, explainSelection, generateTest unchanged) ...
// async function validateSelection() {
//      // --- UPDATED: Removed hardcoded audio/messages ---
//     const editor = vscode.window.activeTextEditor;
//     if (!editor) {
//         vscode.window.showErrorMessage('No active editor found.');
//         return;
//     }

//     const selection = editor.selection;
//     if (selection.isEmpty) {
//         vscode.window.showInformationMessage('No text selected. Select the code you want to validate.');
//         return;
//     }

//     const doc = editor.document;
//     const selectedText = doc.getText(selection);
//     const fullContent = doc.getText();
//     const fileName = doc.fileName ? path.basename(doc.fileName) : 'untitled';
//     const lang = doc.languageId || undefined;

//     vscode.window.withProgress({
//         location: vscode.ProgressLocation.Notification,
//         title: 'Asking AI about selection...',
//         cancellable: false
//     }, async (progress) => {
//         try {
//             const resp = await postJSONRequest('127.0.0.1', 8000, '/validate_selection', {
//                 filename: fileName,
//                 selected_text: selectedText,
//                 full_content: fullContent,
//             }, 120000);

//              // Error handling
//             if (resp && resp.error) {
//                  vscode.window.showErrorMessage('AI Error: ' + resp.error);
//                  playAudioFeedback("An AI error occurred during validation.");
//                  return;
//              }
//              if (!resp || typeof resp.summary === 'undefined') {
//                   vscode.window.showErrorMessage('Invalid response structure from validation server.');
//                   playAudioFeedback("Sorry, I received an invalid response from the server.");
//                   return;
//              }


//             const newSnippet = resp.updated_snippet;
//             const summary = resp.summary;

//             playAudioFeedback(summary);

//             if (newSnippet === null || newSnippet === undefined || newSnippet === selectedText) {
//                 vscode.window.showInformationMessage(`AI: ${summary}`);
//             } else {
//                 const choice = await vscode.window.showWarningMessage(
//                     `AI: ${summary}`, { modal: true },
//                     'Apply Changes', 'Preview Changes', 'Cancel'
//                 );

//                 if (choice === 'Apply Changes') {
//                     await editor.edit(editBuilder => {
//                         editBuilder.replace(selection, newSnippet);
//                     });
//                      // Format only the selection that was changed
//                      await vscode.commands.executeCommand('editor.action.formatSelection');
//                      await doc.save(); // Save after applying and formatting

//                 } else if (choice === 'Preview Changes') {
//                     try {
//                         const originalDoc = await vscode.workspace.openTextDocument({ content: selectedText, language: lang });
//                         const newDoc = await vscode.workspace.openTextDocument({ content: newSnippet, language: lang });
//                         await vscode.commands.executeCommand('vscode.diff', originalDoc.uri, newDoc.uri, `AI Preview — ${fileName} (Selection)`);

//                         const afterPreview = await vscode.window.showWarningMessage('Apply AI suggested changes to your selection?', { modal: true }, 'Apply', 'Cancel');
//                         if (afterPreview === 'Apply') {
//                             await editor.edit(editBuilder => {
//                                 editBuilder.replace(selection, newSnippet);
//                             });
//                              // Format only the selection that was changed
//                              await vscode.commands.executeCommand('editor.action.formatSelection');
//                              await doc.save(); // Save after applying and formatting
//                         }
//                     } catch (diffErr) {
//                         console.error('Diff error', diffErr);
//                         vscode.window.showErrorMessage('Failed to open diff preview: ' + diffErr.message);
//                     }
//                 }
//             }

//         } catch (err) {
//             console.error('Validate selection error:', err);
//             vscode.window.showErrorMessage('Failed to validate selection: ' + err.message);
//             playAudioFeedback("Failed to validate selection.");
//         }
//     });
// }

// // --- NEW: Command for Explain Selection ---
// async function explainSelection() {
//     const editor = vscode.window.activeTextEditor;
//     if (!editor || editor.selection.isEmpty) {
//         vscode.window.showInformationMessage('Please select the code you want explained.');
//         return;
//     }
//     const doc = editor.document;
//     const selection = editor.selection;
//     const selectedText = doc.getText(selection);
//     const fullContent = doc.getText();
//     const fileName = path.basename(doc.fileName || 'untitled');

//     vscode.window.withProgress({
//         location: vscode.ProgressLocation.Notification,
//         title: 'Asking AI to explain...',
//         cancellable: false
//     }, async (progress) => {
//         try {
//             const resp = await postJSONRequest('127.0.0.1', 8000, '/explain_selection', {
//                 filename: fileName,
//                 selected_text: selectedText,
//                 full_content: fullContent,
//             }, 120000);

//             if (resp && resp.error) {
//                  vscode.window.showErrorMessage('AI Error: ' + resp.error);
//                  playAudioFeedback("Sorry, I couldn't get an explanation.");
//                  return;
//              }
//              if (!resp || !resp.summary || !resp.explanation) {
//                   vscode.window.showErrorMessage('Invalid response from explanation server.');
//                   playAudioFeedback("Sorry, I received an invalid explanation response.");
//                   return;
//              }

//             playAudioFeedback(resp.summary); // Play the short summary

//             // Show the detailed explanation in a non-modal message or output channel
//             vscode.window.showInformationMessage(`AI Explanation:\n${resp.explanation}`, { modal: false });
//             // Or use an output channel for longer explanations:
//             // const outputChannel = vscode.window.createOutputChannel("AI Code Explanation");
//             // outputChannel.appendLine(`Explanation for selection in ${fileName}:\n`);
//             // outputChannel.appendLine(resp.explanation);
//             // outputChannel.show(true); // Bring focus to the output channel

//         } catch (err) {
//             console.error('Explain selection error:', err);
//             vscode.window.showErrorMessage('Failed to get explanation: ' + err.message);
//             playAudioFeedback("Failed to get explanation.");
//         }
//     });
// }

// // --- NEW: Command for Generate Test ---
// async function generateTest() {
//     const editor = vscode.window.activeTextEditor;
//      // Allow generating test even if selection is slightly larger, but focus should be on a function/class
//     if (!editor || editor.selection.isEmpty) {
//         vscode.window.showInformationMessage('Please select the function or class you want to generate a test for.');
//         return;
//     }
//     const doc = editor.document;
//     const selection = editor.selection;
//     const selectedText = doc.getText(selection);
//     const fullContent = doc.getText();
//     const fileName = path.basename(doc.fileName || 'untitled');
//     const langId = doc.languageId; // Get language ID

//     vscode.window.withProgress({
//         location: vscode.ProgressLocation.Notification,
//         title: 'Asking AI to generate test...',
//         cancellable: false
//     }, async (progress) => {
//         try {
//             const resp = await postJSONRequest('127.0.0.1', 8000, '/generate_test', {
//                 filename: fileName,
//                 selected_text: selectedText,
//                 full_content: fullContent,
//                 language_id: langId // Pass language ID to server
//             }, 180000); // Longer timeout for test generation

//              if (resp && resp.error) {
//                  vscode.window.showErrorMessage('AI Error: ' + resp.error);
//                  playAudioFeedback("Sorry, I couldn't generate a test.");
//                  return;
//              }
//              if (!resp || !resp.summary || !resp.test_file_content) {
//                   vscode.window.showErrorMessage('Invalid response from test generation server.');
//                   playAudioFeedback("Sorry, I received an invalid test response.");
//                   return;
//              }


//             playAudioFeedback(resp.summary);

//             // Open the generated test in a new untitled document
//             const testDoc = await vscode.workspace.openTextDocument({
//                 content: resp.test_file_content,
//                 language: langId // Use the same language ID if appropriate, or infer from test content
//             });
//             await vscode.window.showTextDocument(testDoc, vscode.ViewColumn.Beside);
//             vscode.window.showInformationMessage('Generated test opened in a new tab.');

//         } catch (err) {
//             console.error('Generate test error:', err);
//             vscode.window.showErrorMessage('Failed to generate test: ' + err.message);
//             playAudioFeedback("Failed to generate test.");
//         }
//     });
// }
// /* ----------------- TTS Helper ----------------- */
// async function playAudioFeedback(text) {
//     // ... (This function is unchanged, includes cleaning and panel check) ...
//      if (!text || typeof text !== 'string' || text.trim().length === 0) {
//         console.log("Skipping audio feedback for empty or invalid text.");
//         return;
//     }

//     // Clean the text
//     let cleanedText = text
//         .replace(/```[\s\S]*?```/gs, ' code block ')
//         .replace(/`([^`]+)`/g, '$1')
//         .replace(/[*_~"']/g, '')
//         .replace(/[\[\]{}()]/g, '')
//         .replace(/=>/g, ' implies ')
//         .replace(/->/g, ' implies ')
//         .replace(/!=/g, ' not equal to ')
//         .replace(/===/g, ' strictly equal to ')
//         .replace(/==/g, ' equal to ')
//         .replace(/&&/g, ' and ')
//         .replace(/\|\|/g, ' or ')
//         .replace(/\s+/g, ' ')
//         .trim();

//      if (cleanedText.length === 0) {
//          console.log("Skipping audio feedback after cleaning resulted in empty text.");
//          return;
//      }
//      console.log(`Cleaned text for TTS: "${cleanedText}"`);


//     try {
//         // Ensure panel exists and is visible
//         if (!voicePanelInstance) {
//             if (!extensionContext) {
//                 console.error("Extension context not available for audio."); return;
//             }
//             console.log("Creating/Revealing voice panel for audio...");
//             await createVoicePanel(extensionContext);
//             await new Promise(resolve => setTimeout(resolve, 150)); // Delay
//         } else if (!voicePanelInstance.visible) {
//              console.log("Revealing voice panel for audio...");
//              voicePanelInstance.reveal(vscode.ViewColumn.Beside);
//              await new Promise(resolve => setTimeout(resolve, 150)); // Delay
//         }

//         if (!voicePanelInstance?.webview) {
//              console.error("Voice panel webview invalid after create/reveal."); return;
//         }

//         console.log("Requesting TTS from server...");
//         const resp = await postJSONRequest('127.0.0.1', 8000, '/tts', { text: cleanedText }, 20000);
//         if (resp?.audio_base64) {
//             console.log("Received TTS audio, sending playAudio command.");
//              // Check webview one last time
//             if (voicePanelInstance?.webview) {
//                  voicePanelInstance.webview.postMessage({
//                      command: 'playAudio',
//                      data: 'data:audio/mpeg;base64,' + resp.audio_base64
//                  });
//             } else { console.error("Webview invalid before posting playAudio."); }
//         } else {
//             console.error("TTS request failed or invalid data:", resp?.error || "No audio data");
//             vscode.window.setStatusBarMessage("⚠️ TTS Failed", 5000);
//         }
//     } catch (err) {
//         console.error("Failed to get/play TTS audio:", err.message);
//         vscode.window.setStatusBarMessage("⚠️ TTS Error", 5000);
//     }
// }


// /* ----------------- Activation / Commands ----------------- */

// function activate(context) {
//     extensionContext = context; // Store context
//     console.log('Voice Code Assistant activated');

//     // Register commands
//     context.subscriptions.push(
//         vscode.commands.registerCommand('code-assistant.startVoiceAssistant', async () => {
//             await createVoicePanel(context);
//         }),
//         vscode.commands.registerCommand('code-assistant.setMode', async () => {
//             const pick = await vscode.window.showQuickPick(
//                  ['Auto Write (apply automatically)', 'Check & Commit (preview before apply)'],
//                  { placeHolder: 'Choose Voice Assistant mode (this changes stored preference)', ignoreFocusOut: true }
//              );
//             if (pick) {
//                  const mode = pick.startsWith('Auto') ? 'auto' : 'check';
//                  await context.globalState.update('vca.mode', mode);
//                  vscode.window.showInformationMessage('Voice Code Assistant mode set to: ' + (mode === 'auto' ? 'Auto Write' : 'Check & Commit'));
//              }
//         }),
//         vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, new SelectionActionProvider(), { providedCodeActionKinds: [vscode.CodeActionKind.RefactorRewrite, vscode.CodeActionKind.Refactor]}),
//         vscode.commands.registerCommand('code-assistant.validateSelection', validateSelection),
//         vscode.commands.registerCommand('code-assistant.explainSelection', explainSelection), // Register new command
//         vscode.commands.registerCommand('code-assistant.generateTest', generateTest)        // Register new command
//     );


//     // Proactive mode prompt (unchanged)
//     (async () => {
//         const stored = context.globalState.get('vca.mode', null);
//         if (!stored) {
//              const pick = await vscode.window.showQuickPick(['Auto Write (apply automatically)', 'Check & Commit (preview before apply)'], { placeHolder: 'Choose Voice Assistant mode (can change later)', ignoreFocusOut: false });
//              if (pick) {
//                  const mode = pick.startsWith('Auto') ? 'auto' : 'check';
//                  await context.globalState.update('vca.mode', mode);
//                  vscode.window.showInformationMessage('Voice Code Assistant mode set to: ' + (mode === 'auto' ? 'Auto Write' : 'Check & Commit'));
//              } else {
//                  if (!context.globalState.get('vca.mode')) {
//                       await context.globalState.update('vca.mode', 'check');
//                  }
//              }
//          }
//     })();
// }

// function deactivate() {
//      // Clean up resources if necessary
//      extensionContext = null;
//      voicePanelInstance = null; // Ensure panel reference is cleared
// }

// module.exports = { activate, deactivate };

// // extension.js

const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');

let extensionContext = null;
let voicePanelInstance = null;

/* ----------------- Utilities ----------------- */
// ... (getSoxExecutable, waitForCondition, postJSONRequest functions are unchanged) ...
function getSoxExecutable() {
    const envPath = process.env.SOX_PATH;
    if (envPath && fs.existsSync(envPath)) return envPath;
    try {
        if (process.platform === 'win32') {
            const out = execSync('where sox', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)[0];
            if (out && fs.existsSync(out)) return out;
        } else {
            const out = execSync('which sox', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)[0];
            if (out && fs.existsSync(out)) return out;
        }
    } catch (e) {}
    const commonWin = 'C:\\Program Files (x86)\\sox-14-4-2\\sox.exe';
    if (process.platform === 'win32' && fs.existsSync(commonWin)) return commonWin;
    return 'sox';
}

function waitForCondition(testFn, timeout = 5000, interval = 100) {
    const start = Date.now();
    return new Promise((resolve) => {
        (function poll() {
            try {
                if (testFn()) return resolve(true);
            } catch (e) {}
            if (Date.now() - start >= timeout) return resolve(false);
            setTimeout(poll, interval);
        })();
    });
}

function postJSONRequest(host, port, pathUrl, jsonObj, timeout = 60000) {
    return new Promise((resolve, reject) => {
        const payload = Buffer.from(JSON.stringify(jsonObj), 'utf8');
        const opts = {
            hostname: host,
            port: port,
            path: pathUrl,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': payload.length
            },
            timeout: timeout
        };

        const req = http.request(opts, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (!data) {
                        console.error(`Empty response received from ${pathUrl} (Status: ${res.statusCode})`);
                        return resolve({ error: `Empty response from server (Status: ${res.statusCode})`, raw: '', status: res.statusCode });
                    }
                    const parsed = JSON.parse(data);
                     if (res.statusCode && res.statusCode >= 400) {
                         console.error(`Server error status ${res.statusCode} for ${pathUrl}:`, parsed);
                         resolve({ ...parsed, status: res.statusCode }); // Let caller handle error content
                     } else {
                         resolve(parsed);
                     }
                } catch (e) {
                    console.error(`Invalid JSON received from ${pathUrl}:`, e);
                    reject(new Error(`Invalid JSON from server: ${e.message} – raw: ${data}`));
                }
            });
        });

        req.on('error', (err) => {
            console.error(`HTTP request error to ${pathUrl}:`, err);
            reject(new Error(`HTTP request failed: ${err.message || err.code}`));
        });

        req.on('timeout', () => {
             console.error(`Request timeout for ${pathUrl}`);
            req.destroy(new Error(`Request timeout after ${timeout}ms`)); // Include timeout value
        });


        req.write(payload);
        req.end();
    });
}
/* ----------------- Mode prompt ----------------- */
// ... (promptForModeIfUnset unchanged) ...
async function promptForModeIfUnset(context) {
    const stored = context.globalState.get('vca.mode', null);
    if (stored === 'auto' || stored === 'check') return stored;
    // Prompt user (modal)
    const pick = await vscode.window.showQuickPick(
        ['Auto Write (apply automatically)', 'Check & Commit (preview before apply)'],
        { placeHolder: 'Choose Voice Assistant mode (you can change later)', ignoreFocusOut: true }
    );
    let mode = 'check';
    if (pick && pick.startsWith('Auto')) mode = 'auto';
    await context.globalState.update('vca.mode', mode);
    vscode.window.showInformationMessage('Voice Code Assistant mode set to: ' + (mode === 'auto' ? 'Auto Write' : 'Check & Commit'));
    return mode;
}
/* ----------------- Recording & Webview ----------------- */
// ... (createVoicePanel unchanged) ...
async function createVoicePanel(context) {
    // Check if panel already exists
    if (voicePanelInstance) {
        voicePanelInstance.reveal(vscode.ViewColumn.Beside);
        return voicePanelInstance;
    }

    // Ensure user chooses mode before creating interactive webview
    const mode = await promptForModeIfUnset(context);

    const panel = vscode.window.createWebviewPanel(
        'voiceCodeAssistant',
        'Voice Code Assistant',
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.webview.html = getWebviewContent(mode);
    panel._recordSession = null;

    panel.webview.onDidReceiveMessage(async (message) => {
         // --- Remove StopRecording Case ---
        try {
            switch (message.command) {
                case 'startRecording':
                    startRecording(panel); // Pass panel context
                    break;
                // 'stopRecording' is no longer sent from webview
                case 'deleteRecording':
                    // --- Added cleanup for session ---
                    if (panel._recordSession?.proc && !panel._recordSession.proc.killed) {
                        try { panel._recordSession.proc.kill(); } catch (e) {} // Kill active recording if deleting
                    }
                    if (panel._recordSession?.outFile) {
                        try { if(fs.existsSync(panel._recordSession.outFile)) fs.unlinkSync(panel._recordSession.outFile); } catch (e) {}
                    }
                    panel._recordSession = null; // Clear session state
                    panel.webview.postMessage({ command: 'status', text: 'Deleted recording.' });
                    panel.webview.postMessage({ command: 'transcriptionResult', text: '' });
                    panel.webview.postMessage({ command: 'recordingStoppedUI' }); // Reset UI
                    break;
                case 'setMode':
                    if (message.mode === 'auto' || message.mode === 'check') {
                        await context.globalState.update('vca.mode', message.mode);
                        panel.webview.postMessage({ command: 'mode', mode: message.mode });
                        vscode.window.showInformationMessage('Voice Code Assistant mode set to: ' + (message.mode === 'auto' ? 'Auto Write' : 'Check & Commit'));
                    }
                    break;
                case 'checkCommitAIEdits':
                    await applyAIEditsSafe({ updatedFile: message.updatedFile, edits: null, auto: false }, panel); // Pass null for edits
                    break;
            }
        } catch (err) {
            console.error('Message handler error', err);
            panel.webview.postMessage({ command: 'error', text: String(err.message || err) });
             panel.webview.postMessage({ command: 'recordingStoppedUI' }); // Reset UI on error
        }
    }, undefined, context.subscriptions); // Pass subscriptions for disposal handling
    panel.onDidDispose(() => {
        if (panel._recordSession?.proc && !panel._recordSession.proc.killed) {
            try { panel._recordSession.proc.kill(); console.log("Killed SoX process on panel dispose.");} catch (e) {}
        }
         // Clean up temp file on dispose if it still exists
         if (panel._recordSession?.outFile && fs.existsSync(panel._recordSession.outFile)) {
             try { fs.unlinkSync(panel._recordSession.outFile); console.log("Deleted temp audio file on panel dispose."); } catch (e) {}
         }
        voicePanelInstance = null; // Clear global reference
        panel._recordSession = null; // Ensure session is cleared
    }, null, context.subscriptions);
    panel.webview.postMessage({ command: 'mode', mode: mode });
    voicePanelInstance = panel; // Set global reference
    return panel;
}

function startRecording(panel) {
    // --- UPDATED with new SoX params and robust checks ---
    if (!panel || !panel.webview) {
        console.error("startRecording: Invalid panel state.");
        return;
    }
    if (panel._recordSession && panel._recordSession.recording) {
        panel.webview.postMessage({ command: 'status', text: 'Already recording.' });
        return;
    }
    console.log("Starting recording...");

    const soxExe = getSoxExecutable();
    if (soxExe !== 'sox' && !fs.existsSync(soxExe)) {
        panel.webview.postMessage({ command: 'error', text: `SoX not found at "${soxExe}". Set SOX_PATH or add sox to PATH.` });
        return;
    }

    const outFile = path.join(os.tmpdir(), `vca_record_${Date.now()}.wav`);

    // --- 🚀 FIX: ADJUSTED SoX PARAMS ---
    // Added pad 0.1 0: Adds 0.1s silence before processing starts (helps catch start of speech)
    // Adjusted silence params: silence [above_periods duration threshold%] [below_periods duration threshold%]
    //   1 0.2 0.5% : Trigger detection after 0.2s of sound above 0.5% volume (more sensitive start)
    //   1 1.5 0.5% : Stop recording after 1.5s of sound below 0.5% volume (less sensitive stop, allows for pauses)
    const args = [
        '-t', 'waveaudio', 'default', // Input device
        '-r', '16000', '-c', '1',    // Sample rate and channels
        outFile,                     // Output file
        'pad', '0.1', '0',           // Add 0.1s padding at start
        'silence', '1', '0.2', '0.5%', // Sound detection: wait for 1 period of 0.2s above 0.5%
        '1', '1.5', '0.5%'             // Silence detection: stop after 1 period of 1.5s below 0.5%
    ];
    // --- (Alternative Threshold: Try 1% if 0.5% is too sensitive to background noise) ---
    // const args = [... '-t', 'waveaudio', ..., outFile, 'pad', '0.1', '0', 'silence', '1', '0.2', '1%', '1', '1.5', '1%'];


    console.log(`Spawning SoX: ${soxExe} ${args.join(' ')}`);

    let proc;
    try {
        proc = spawn(soxExe, args, { windowsHide: true });
        // Set session immediately
        panel._recordSession = { proc, outFile, recording: true, closed: false };
        console.log("SoX process spawned, PID:", proc.pid);
    } catch (err) {
        console.error('Failed to spawn SoX:', err);
        panel.webview.postMessage({ command: 'error', text: 'Failed to spawn SoX: ' + err.message });
        panel._recordSession = null; // Clear session
        return;
    }

    let soxErrOutput = '';
    proc.stderr.on('data', (data) => {
        const errText = data.toString();
        console.log("SoX stderr:", errText); // Log stderr output
        soxErrOutput += errText;
    });

    proc.on('error', (err) => {
        console.error('SoX process error event:', err);
        if (panel?.webview) { // Check if panel still exists
            panel.webview.postMessage({ command: 'error', text: 'SoX process error: ' + err.message });
            panel.webview.postMessage({ command: 'recordingStoppedUI' });
        }
        if (panel) panel._recordSession = null; // Clear session
    });

    proc.on('close', (code, signal) => {
        console.log(`SoX process close event (code=${code}, signal=${signal})`);
        // Crucial check: Only proceed if the panel and its session are still valid
        if (!panel || !panel._recordSession) {
            console.log("SoX closed, but panel/session is invalid. Ignoring.");
            // Attempt cleanup if outFile path is known somehow, but risky
            return;
        }

        panel._recordSession.closed = true;

        if (code !== 0 && soxErrOutput) {
            console.warn(`SoX exited with code ${code}. Stderr: ${soxErrOutput}`);
            // Don't necessarily treat non-zero exit as fatal error for silence detection
            // It might indicate input stopped before silence duration, which is OK.
        }

        // --- Automatically trigger processing ---
        // Check recording flag to prevent double processing
        if (panel._recordSession.recording) {
            console.log("SoX closed naturally (likely silence). Triggering processing...");
            // Mark as not recording *before* the timeout to prevent race conditions
            panel._recordSession.recording = false;
            setTimeout(() => {
                 // Check panel validity *again* before calling stopRecordingAndSend
                if (voicePanelInstance === panel && panel._recordSession != null) { // Use != null to check for both null and undefined
                    stopRecordingAndSend(panel, extensionContext);
                 } else {
                     console.log("Panel mismatch or session cleared after SoX close timeout, skipping processing.");
                     // Ensure UI is reset if processing is skipped here
                     if(panel?.webview) panel.webview.postMessage({ command: 'recordingStoppedUI' });
                 }
            }, 300); // Delay for file write completion
        } else {
            console.log("SoX closed, but recording flag already false (likely manual stop/error).");
             // Ensure UI is reset even if stop was called manually/errored before
             if (panel?.webview) panel.webview.postMessage({ command: 'recordingStoppedUI' });
        }
    });

    // Update UI
    panel.webview.postMessage({ command: 'status', text: '🎤 Recording... (stops automatically on silence)' });
    panel.webview.postMessage({ command: 'recordingStartedUI' });
}


async function stopRecordingAndSend(panel, context) {
    // --- UPDATED: More robust checks and cleanup ---
    const s = panel?._recordSession;

    if (!s || s.stoppedProcessing) { // Add flag to prevent re-entry
        console.log("stopRecordingAndSend called but session invalid or already processed. Exiting.");
        if (panel?.webview) panel.webview.postMessage({ command: 'recordingStoppedUI' });
        return;
    }
    console.log("Executing stopRecordingAndSend...");
    s.stoppedProcessing = true; // Mark that processing has started

    // Ensure recording flag is false (might be set by 'close' handler already)
    s.recording = false;

    // Kill process ONLY if it wasn't closed naturally (manual stop scenario - though less likely now)
    // And check if proc exists and hasn't exited
    if (s.proc && !s.closed && !s.proc.killed && s.proc.exitCode === null) {
        try {
            console.log("Manually stopping SoX process (should be rare)...");
            s.proc.kill();
            await waitForCondition(() => s.closed === true, 1000, 50); // Shorter wait after manual kill
        } catch (e) {
            console.error("Error killing SoX:", e);
        }
    } else {
         // If already closed, just wait a moment for file finalization
         await new Promise(resolve => setTimeout(resolve, 100));
    }


    const outFile = s.outFile; // Store path before potentially nullifying session

    try {
        if (!outFile || !fs.existsSync(outFile)) {
            console.error('Recording file not found:', outFile);
            if (panel?.webview) panel.webview.postMessage({ command: 'error', text: 'Recording file not found.' });
            return;
        }

        const stats = fs.statSync(outFile);
        if (stats.size < 100) {
            console.error('Recorded file too small:', outFile, 'Size:', stats.size);
            if (panel?.webview) panel.webview.postMessage({ command: 'error', text: 'Recorded audio seems empty.' });
            // Clean up small/empty file happens in finally block
            return;
        }
        console.log(`Reading recording file: ${outFile} (${stats.size} bytes)`);

        const buff = fs.readFileSync(outFile); // Read before potential deletion
        const base64 = buff.toString('base64');
        if (panel?.webview) {
             panel.webview.postMessage({ command: 'recordingSaved', filename: path.basename(outFile), data: base64 });
             panel.webview.postMessage({ command: 'status', text: `Processing recording...` });
        }

        // --- Transcription ---
        if (panel?.webview) {
             panel.webview.postMessage({ command: 'status', text: 'Transcribing...' });
             panel.webview.postMessage({ command: 'transcriptionResult', text: '...' });
        }
        let transcriptText = '';
        try {
            console.log("Sending transcription request...");
            const resp = await postJSONRequest('127.0.0.1', 8000, '/transcribe', { filename: path.basename(outFile), data: base64 }, 120000);

            if (resp?.error) throw new Error(resp.error); // Handle server error
            if (typeof resp?.text !== 'string') throw new Error('No text in transcription response');

            transcriptText = resp.text.trim();
            console.log("Transcription successful:", transcriptText);
             if (panel?.webview) {
                 panel.webview.postMessage({ command: 'transcriptionResult', text: transcriptText });
                 panel.webview.postMessage({ command: 'status', text: 'Transcription complete.' });
            }

        } catch (err) {
            console.error('Transcription failed:', err);
             if (panel?.webview) {
                 panel.webview.postMessage({ command: 'transcriptionResult', text: '' });
                 panel.webview.postMessage({ command: 'error', text: 'Transcription failed: ' + err.message });
             }
            playAudioFeedback("Sorry, I couldn't transcribe that.");
            return; // Stop if transcription fails
        }
        // --- Suggestion ---
        if (transcriptText) {
            let editor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0];
            if (editor?.document) {
                const fileContent = editor.document.getText();
                const fileName = path.basename(editor.document.fileName || 'untitled');
                 if (panel?.webview) panel.webview.postMessage({ command: 'status', text: 'Asking AI...' });
                 console.log("Sending suggestion request...");

                try {
                    const suggestResp = await postJSONRequest('127.0.0.1', 8000, '/suggest', { filename: fileName, transcript: transcriptText, file_content: fileContent }, 120000);

                    if (suggestResp?.error) throw new Error(suggestResp.error);
                    if (typeof suggestResp?.summary !== 'string') throw new Error('Invalid suggestion response structure');

                    console.log("Suggestion successful:", suggestResp.summary);
                     if (panel?.webview) {
                         panel.webview.postMessage({ command: 'aiSuggestions', summary: suggestResp.summary, updated_file: suggestResp.updated_file, raw: suggestResp.raw });
                     }

                    playAudioFeedback(suggestResp.summary);

                    const mode = context.globalState.get('vca.mode', 'check');
                    const hasEdits = typeof suggestResp.updated_file === 'string';

                    if (!hasEdits) {
                         if (panel?.webview) panel.webview.postMessage({ command: 'status', text: suggestResp.summary || 'AI: No changes needed.' });
                    } else if (mode === 'auto') {
                        await applyAIEditsSafe({ updatedFile: suggestResp.updated_file, auto: true }, panel);
                    } else {
                         if (panel?.webview) panel.webview.postMessage({ command: 'status', text: suggestResp.summary || 'AI suggestions received. Review and commit.' });
                    }
                } catch (err) {
                    console.error('Suggestion failed:', err);
                     if (panel?.webview) panel.webview.postMessage({ command: 'error', text: 'Suggestion failed: ' + err.message });
                    playAudioFeedback("Sorry, I couldn't get suggestions.");
                }
            } else {
                 console.log("No active editor for suggestion.");
                 if (panel?.webview) panel.webview.postMessage({ command: 'status', text: 'No active editor found.' });
                playAudioFeedback("Please open a file first.");
            }
        } else {
             console.log("Empty transcription, skipping suggestion.");
             if (panel?.webview) panel.webview.postMessage({ command: 'status', text: 'No speech detected.' });
             playAudioFeedback("I didn't hear anything clearly.");
        }

    } catch (err) {
        console.error('Error during stopRecordingAndSend processing:', err);
         if (panel?.webview) {
             panel.webview.postMessage({ command: 'error', text: 'Error processing recording: ' + err.message });
         }
         playAudioFeedback("An error occurred processing the recording.");
    } finally {
        // --- Final Cleanup & UI Reset ---
        console.log("Running finally block in stopRecordingAndSend...");
        // Clean up temp file regardless of success/failure above
        if (outFile && fs.existsSync(outFile)) {
            try {
                fs.unlinkSync(outFile);
                console.log("Deleted temp audio file in finally block:", outFile);
            } catch (e) {
                console.error("Failed to delete temp audio file in finally block:", e);
            }
        }
        // Clear session state on the panel object IF it still exists
        if (panel) {
            panel._recordSession = null;
        }
        // Ensure UI state is reset
        if (panel?.webview) {
            panel.webview.postMessage({ command: 'recordingStoppedUI' });
        }
        console.log("stopRecordingAndSend finished.");
    }
}


/* ----------------- Apply edits & validation ----------------- */
// ... (applyAIEditsSafe unchanged, relies on playAudioFeedback) ...
async function applyAIEditsSafe(message, panel) {
    // ... (This function is largely unchanged, relies on playAudioFeedback, added formatting)
    try {
        const updatedFile = message.updatedFile || null; // Use null if undefined
        const autoMode = !!message.auto;

        const editor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0];
        if (!editor) {
             vscode.window.showErrorMessage('No active editor to apply changes.');
             playAudioFeedback("I can't apply changes, no editor is active.");
             return;
         }
        const doc = editor.document;
        const originalText = doc.getText();

        if (updatedFile === null) {
             const msg = "AI did not provide updated file content.";
             if (panel?.webview) panel.webview.postMessage({ command: 'status', text: msg });
             vscode.window.showInformationMessage(msg);
             playAudioFeedback(msg);
             return;
         }

        if (updatedFile === originalText) {
            const msg = "AI suggested no changes (result equals current file).";
            vscode.window.showInformationMessage(msg);
             playAudioFeedback(msg);
            return;
        }

        let newText = updatedFile;

        const ext = path.extname(doc.fileName || '').toLowerCase();
        const langId = (doc.languageId || '').toLowerCase();
        const isBraceLang = isBraceLanguage(doc);

        if (isBraceLang) {
            const { fixedText, fixed } = tryFixBraceBalance(newText);
            if (fixed) { console.log("Applied brace fix."); newText = fixedText; }
        }

        const validatorInfo = getValidatorForLang(ext, langId);
        let validationResult = { available: false };
        if (validatorInfo) {
            if (panel?.webview) panel.webview.postMessage({ command: 'status', text: 'Validating...' });
            try {
                validationResult = await runLanguageValidation(validatorInfo, newText);
            } catch (e) {
                validationResult = { available: false, errorMessage: String(e) };
            }
        }

        if (autoMode) {
            if (validationResult.available && !validationResult.ok) {
                const msg = `Auto Write blocked: validation failed: ${validationResult.errorMessage || 'syntax errors'}`;
                const choice = await vscode.window.showErrorMessage(msg, { modal: true }, 'Show errors', 'Cancel');
                playAudioFeedback("Auto Write blocked due to validation errors.");
                 if (choice === 'Show errors') {
                     const errDoc = await vscode.workspace.openTextDocument({ content: validationResult.fullOutput || validationResult.stderr || 'No details', language: 'text' });
                     await vscode.window.showTextDocument(errDoc, { preview: true });
                 }
            } else {
                await applyWholeFile(doc, newText);
                 // --- Auto Format ---
                 await vscode.commands.executeCommand('editor.action.formatDocument');
                // Summary already spoken by AI
            }
            return;
        }

        // Check & Commit
        if (validationResult.available && !validationResult.ok) {
            const msg = `Validation failed: ${validationResult.errorMessage || validationResult.stderr || 'syntax errors'}`;
            playAudioFeedback("Validation failed.");
            const choice = await vscode.window.showErrorMessage(msg, { modal: true }, 'Preview anyway', 'Show errors', 'Cancel');
            if (choice === 'Show errors') {
                 const errDoc = await vscode.workspace.openTextDocument({ content: validationResult.fullOutput || validationResult.stderr || 'No details', language: 'text' });
                 await vscode.window.showTextDocument(errDoc, { preview: true });
                 return;
             }
            if (choice === 'Cancel' || !choice) return;
        }

        const autoNote = validationResult.available ? (validationResult.ok ? ' (validated ok)' : ' (validation errors)') : ' (no validator)';
        const choice = await vscode.window.showWarningMessage(`AI suggests changes.${autoNote} Preview or apply?`, { modal: true }, 'Preview changes', 'Apply changes', 'Cancel');
        if (choice === 'Cancel' || !choice) return;

        if (choice === 'Preview changes') {
            const lang = doc.languageId;
            const newDoc = await vscode.workspace.openTextDocument({ content: newText, language: lang });
            await vscode.commands.executeCommand('vscode.diff', doc.uri, newDoc.uri, `AI Preview — ${path.basename(doc.fileName || 'untitled')}`);
            const after = await vscode.window.showWarningMessage('Apply AI suggested changes?', 'Apply', 'Cancel');
            if (after !== 'Apply') return;
        }

        await applyWholeFile(doc, newText);
         // --- Auto Format ---
         await vscode.commands.executeCommand('editor.action.formatDocument');
        // Summary already spoken by AI

    } catch (err) {
        console.error('applyAIEditsSafe error:', err);
        vscode.window.showErrorMessage('Failed to apply edits: ' + err.message);
        playAudioFeedback("Failed to apply edits.");
    }
}
async function applyWholeFile(doc, newText) {
     console.log("Applying whole file update...");
    const fullRange = new vscode.Range(new vscode.Position(0, 0), doc.lineAt(doc.lineCount - 1).range.end); // More accurate range
    const wsEdit = new vscode.WorkspaceEdit();
    wsEdit.replace(doc.uri, fullRange, newText);
    const success = await vscode.workspace.applyEdit(wsEdit);
     if (!success) {
         console.error('WorkspaceEdit.applyEdit failed');
         throw new Error('Failed to apply workspace edit.');
     }
     console.log("Whole file update applied successfully.");
     // Save the document after applying edits
     await doc.save();
     console.log("Document saved after applying edits.");
}


/* ----------------- Edit helpers & brace-fixer ----------------- */
// ... (applyEditsToText, isBraceLanguage, tryFixBraceBalance unchanged) ...
function applyEditsToText(text, edits) {
    // ... (This function is unchanged)
    const origLines = text.replace(/\r\n/g, '\n').split('\n');
    const normalized = (edits || []).map(e => {
        const start_line = (typeof e.start_line === 'number') ? e.start_line : ((typeof e.start === 'number') ? e.start : 1);
        const end_line = (typeof e.end_line === 'number') ? e.end_line : ((typeof e.end === 'number') ? e.end : start_line);
        const new_text = (e.new_text != null) ? String(e.new_text) : (e.text != null ? String(e.text) : '');
        return { start_line, end_line, new_text };
    });
    normalized.sort((a, b) => b.start_line - a.start_line);

    let lines = origLines.slice();
    for (const ed of normalized) {
        const s = Math.max(1, Math.min(ed.start_line, lines.length + 1));
        const e = Math.max(1, Math.min(ed.end_line, lines.length));
        const si = s - 1;
        const ei = Math.max(si, e - 1);
        const newLines = ed.new_text.replace(/\r\n/g, '\n').split('\n');
        if (si > lines.length) {
            while (lines.length < si) lines.push('');
            lines = lines.concat(newLines);
        } else {
            const before = lines.slice(0, si);
            const after = lines.slice(ei + 1);
            lines = before.concat(newLines).concat(after);
        }
    }
    return lines.join('\n');
}

function isBraceLanguage(doc) {
    // ... (This function is unchanged)
    const ext = path.extname(doc.fileName || '').toLowerCase();
    const langId = (doc.languageId || '').toLowerCase();

    const braceExts = ['.js', '.jsx', '.ts', '.tsx', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.swift', '.kt', '.kts'];
    const braceLangIds = ['javascript', 'typescript', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'swift', 'kotlin'];

    if (braceExts.includes(ext)) return true;
    for (const id of braceLangIds) {
        if (langId.includes(id)) return true;
    }
    return false;
}

function tryFixBraceBalance(text) {
    // ... (This function is unchanged)
    const openCount = (text.match(/\{/g) || []).length;
    const closeCount = (text.match(/\}/g) || []).length;
    let diff = closeCount - openCount;
    
    if (diff <= 0) {
        return { fixedText: text, fixed: false };
    }

    let lines = text.replace(/\r\n/g, '\n').split('\n');
    let fixed = false;

    for (let i = lines.length - 1; i >= 0 && diff > 0; i--) {
        const trimmed = lines[i].trim();
        if (trimmed === '}' || trimmed === '};' || trimmed === '},') {
            lines.splice(i, 1);
            diff--;
            fixed = true;
        }
    }
    
    if (diff > 0) {
        for (let i = lines.length - 1; i >= 0 && diff > 0; i--) {
            let line = lines[i];
            let removed = 0;
            while (line.trim().endsWith('}') && diff > 0) {
                line = line.replace(/}\s*$/, '');
                diff--;
                removed++;
            }
            if (removed > 0) {
                lines[i] = line;
                fixed = true;
            }
        }
    }
    return { fixedText: lines.join('\n'), fixed };
}
/* ----------------- Language validation ----------------- */
// ... (getValidatorForLang, runLanguageValidation, inferExtensionFromValidator unchanged) ...
function getValidatorForLang(ext, langId) {
    // ... (This function is unchanged)
    const map = [
        { match: (e, l) => e === '.py' || l.includes('python'), name: 'Python (py_compile)', cmd: 'python', args: (p) => ['-m', 'py_compile', p] },
        { match: (e, l) => e === '.js' || l.includes('javascript'), name: 'Node (syntax check)', cmd: 'node', args: (p) => ['--check', p] },
        { match: (e, l) => e === '.ts' || l.includes('typescript'), name: 'TypeScript (tsc)', cmd: 'tsc', args: (p) => ['--noEmit', '--skipLibCheck', p] },
        { match: (e, l) => e === '.java' || l.includes('java'), name: 'Java (javac)', cmd: 'javac', args: (p) => [p] },
        { match: (e, l) => e === '.c' || l.includes('c'), name: 'C (gcc -fsyntax-only)', cmd: 'gcc', args: (p) => ['-fsyntax-only', p] },
        { match: (e, l) => e === '.cpp' || e === '.cc' || e === '.cxx' || l.includes('cpp') || l.includes('c++'), name: 'C++ (g++ -fsyntax-only)', cmd: 'g++', args: (p) => ['-fsyntax-only', p] }
    ];
    for (const m of map) if (m.match(ext, langId)) return { name: m.name, cmd: m.cmd, argsFn: m.args };
    return null;
}

function runLanguageValidation(validatorInfo, text, timeoutMs = 15000) {
    // ... (This function is unchanged)
    return new Promise((resolve) => {
        const tmpdir = os.tmpdir();
        const ext = inferExtensionFromValidator(validatorInfo.cmd) || '.tmp';
        const tmpPath = path.join(tmpdir, `vca_validate_${Date.now()}${ext}`);

        try {
            fs.writeFileSync(tmpPath, text, 'utf8');
        } catch (e) {
            return resolve({ available: false, ok: false, errorMessage: 'Failed to write temp file: ' + String(e) });
        }

        const args = validatorInfo.argsFn(tmpPath);
        const cmd = validatorInfo.cmd;

        const child = spawn(cmd, args, { windowsHide: true, shell: true });
        let stdout = '';
        let stderr = '';
        let finished = false;

        const killTimer = setTimeout(() => {
            if (!finished) {
                try { child.kill(); } catch (e) {}
                finished = true;
                try { fs.unlinkSync(tmpPath); } catch (e) {}
                return resolve({ available: false, ok: false, errorMessage: 'Validation timed out' });
            }
        }, timeoutMs);

        child.stdout.on('data', d => stdout += d.toString());
        child.stderr.on('data', d => stderr += d.toString());
        child.on('error', (err) => {
            if (finished) return;
            clearTimeout(killTimer);
            finished = true;
            try { fs.unlinkSync(tmpPath); } catch (e) {}
            if (err.code === 'ENOENT') {
                return resolve({ available: false, ok: false, errorMessage: `Validator command not found: ${cmd}. Is it in your PATH?` });
            }
            return resolve({ available: false, ok: false, errorMessage: String(err) });
        });

        child.on('close', (code) => {
            if (finished) return;
            clearTimeout(killTimer);
            finished = true;
            try { fs.unlinkSync(tmpPath); } catch (e) {}
            if (code === 0) {
                return resolve({ available: true, ok: true, stdout, stderr, fullOutput: stdout + stderr });
            } else {
                const out = stdout + stderr;
                return resolve({ available: true, ok: false, stdout, stderr, fullOutput: out, errorMessage: out || `exit code ${code}` });
            }
        });
    });
}

function inferExtensionFromValidator(cmd) {
    // ... (This function is unchanged)
    if (cmd === 'python') return '.py';
    if (cmd === 'node') return '.js';
    if (cmd === 'tsc') return '.ts';
    if (cmd === 'javac') return '.java';
    if (cmd === 'gcc') return '.c';
    if (cmd === 'g++') return '.cpp';
    return '.txt';
}
/* ----------------- Webview content ----------------- */

function getWebviewContent(storedMode) {
    // --- UPDATED: Removed stopBtn, added UI handlers ---
    const initialMode = storedMode || 'unset';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Voice Capture</title>
<style>
    body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial; padding: 18px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
    button { padding:8px 12px; margin-right:8px; border-radius:6px; border:none; cursor:pointer; transition: background-color 0.2s ease; }
    .start{ background:var(--vscode-button-background); color:var(--vscode-button-foreground); }
    .start:hover { background: var(--vscode-button-hoverBackground); }
    /* Removed .stop style */
    .auto{ background:#27ae60; color:white; }
    .check{ background:#2d8cf0; color:white; }
    .stop-speak { background: #f39c12; color: white; margin-left: 15px;}
    button:disabled { background: var(--vscode-disabledForeground); color: var(--vscode-editor-background); cursor: default; opacity: 0.6; } /* Improved disabled style */

    #status{ margin-top:12px; padding:10px; border-radius:6px; background:var(--vscode-input-background); border:1px solid var(--vscode-input-border); min-height:48px; display:flex; align-items:center; transition: background-color 0.3s ease;}
    #status.recording { background-color: rgba(231, 76, 60, 0.2); } /* Subtle recording indicator */
    #status.processing { background-color: rgba(45, 140, 240, 0.15); } /* Processing indicator */


    audio{ width:100%; margin-top:12px; }
    #transcription{ margin-top:12px; padding:12px; border-radius:6px; background:rgba(0,0,0,0.03); white-space:pre-wrap; min-height:80px; border:1px solid var(--vscode-input-border); }
    #aiBox{ margin-top:12px; padding:12px; border-radius:6px; background:rgba(0,0,0,0.02); border:1px dashed var(--vscode-input-border); }
    pre{ white-space:pre-wrap; word-break:break-word; max-height:300px; overflow:auto; background: var(--vscode-input-background); padding: 8px; border-radius: 4px;}
    .btnRow{ margin-top:10px; }
    #modeLabel { margin-left:8px; font-weight:600; }
</style>
</head>
<body>
    <h3>Voice-Enabled Code Assistant</h3>
    <div>
        <button id="startBtn" class="start">Start Recording</button>
        <button id="deleteBtn" disabled>Delete Recording</button>
        <span id="modeLabel">Mode: ${initialMode === 'unset' ? 'Not set' : (initialMode === 'auto' ? 'Auto Write' : 'Check & Commit')}</span>
        <button id="stopSpeakBtn" class="stop-speak" style="display:none;">Stop Speaking 🔇</button>
    </div>

    <div id="status">Press Start to record (stops on silence).</div>

    <audio id="player" controls hidden></audio> <audio id="audioPlayer" style="display:none;"></audio> <div id="transcription">Transcription will appear here after processing.</div>

    <div id="aiBox" hidden>
        <h4>AI suggestions</h4>
        <div id="aiSummary"></div>
        <pre id="aiRaw" style="display:none;"></pre>
        <button id="commitBtn" class="check" style="display:none; margin-top: 10px;">Check & Commit Changes</button>
        <div class="btnRow" style="margin-top: 20px; border-top: 1px solid var(--vscode-input-border); padding-top: 10px;">
            <button id="autoBtn" class="auto">Set Auto Write</button>
            <button id="checkBtn" class="check">Set Check & Commit</button>
        </div>
        <div style="margin-top:8px;color:var(--vscode-descriptionForeground)">Auto Write applies changes automatically. Check & Commit allows review first.</div>
    </div>

<script>
    const vscode = acquireVsCodeApi();
    const startBtn = document.getElementById('startBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const statusDiv = document.getElementById('status');
    const player = document.getElementById('player');
    const transcriptionDiv = document.getElementById('transcription');
    const aiBox = document.getElementById('aiBox');
    const aiSummary = document.getElementById('aiSummary');
    const aiRaw = document.getElementById('aiRaw');
    const autoBtn = document.getElementById('autoBtn');
    const checkBtn = document.getElementById('checkBtn');
    const modeLabel = document.getElementById('modeLabel');
    const commitBtn = document.getElementById('commitBtn');
    const audioPlayer = document.getElementById('audioPlayer');
    const stopSpeakBtn = document.getElementById('stopSpeakBtn');

    let latestAI = null;
    let currentMode = '${initialMode}';

    function resetUIState() {
        console.log("Resetting UI state");
        startBtn.disabled = false;
        // Keep delete enabled only if a recording was successfully saved and is visible
        deleteBtn.disabled = player.hidden || !player.src;
        statusDiv.textContent = 'Press Start to record (stops on silence).';
        statusDiv.classList.remove('recording', 'processing');
        // Don't clear transcription or AI box here, let new results overwrite
    }


    startBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'startRecording' });
        startBtn.disabled = true;
        deleteBtn.disabled = true;
        statusDiv.textContent = 'Starting recording...';
        statusDiv.classList.add('recording'); // Add recording class
        statusDiv.classList.remove('processing');
        player.hidden = true; player.src = ''; // Hide old recording
        transcriptionDiv.textContent = ''; aiBox.hidden = true; latestAI = null; commitBtn.style.display = 'none';
        stopSpeakBtn.style.display = 'none'; audioPlayer.pause(); audioPlayer.src = '';
    });

    // deleteBtn listener now calls resetUIState implicitly via recordingStoppedUI message
    deleteBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'deleteRecording' });
        // UI updates will happen via 'recordingStoppedUI' and status/error messages
        player.hidden = true; player.src = ''; // Immediately hide player
        deleteBtn.disabled = true; // Immediately disable delete
        transcriptionDiv.textContent = ''; // Clear transcription
        aiBox.hidden = true; // Hide AI box
    });

    autoBtn.addEventListener('click', () => vscode.postMessage({ command: 'setMode', mode: 'auto' }));
    checkBtn.addEventListener('click', () => vscode.postMessage({ command: 'setMode', mode: 'check' }));

    commitBtn.addEventListener('click', () => {
        if (latestAI) {
            vscode.postMessage({ command: 'checkCommitAIEdits', updatedFile: latestAI.updated_file, edits: null });
            commitBtn.style.display = 'none';
            statusDiv.textContent = 'Applying changes...';
             statusDiv.classList.add('processing');
        }
    });

    stopSpeakBtn.addEventListener('click', () => {
        console.log('Stop speak clicked'); audioPlayer.pause(); audioPlayer.currentTime = 0; audioPlayer.src = ''; stopSpeakBtn.style.display = 'none';
    });

    audioPlayer.addEventListener('play', () => { console.log('Audio playing'); stopSpeakBtn.style.display = 'inline-block'; });
    audioPlayer.addEventListener('ended', () => { console.log('Audio ended'); stopSpeakBtn.style.display = 'none'; });
    audioPlayer.addEventListener('pause', () => { console.log('Audio paused'); if (!audioPlayer.src || audioPlayer.currentTime === 0 || audioPlayer.ended) { stopSpeakBtn.style.display = 'none'; } });
    audioPlayer.addEventListener('error', (e) => { console.error('Audio error:', e); statusDiv.textContent = 'Error playing audio.'; stopSpeakBtn.style.display = 'none'; });

    window.addEventListener('message', event => {
        const msg = event.data;
        console.log('Webview received message:', msg.command, msg.text || ''); // Log text for status/error
        switch (msg.command) {
            case 'status':
                 statusDiv.textContent = msg.text;
                 // Add/remove processing class based on status text
                 if (msg.text?.toLowerCase().includes('processing') || msg.text?.toLowerCase().includes('transcribing') || msg.text?.toLowerCase().includes('asking ai')) {
                     statusDiv.classList.add('processing');
                     statusDiv.classList.remove('recording');
                 } else if (!msg.text?.toLowerCase().includes('recording')) { // Avoid removing if status is still about recording
                     statusDiv.classList.remove('processing');
                 }
                 // Remove recording class if status indicates completion or processing
                 if (!msg.text?.toLowerCase().includes('recording...')) {
                     statusDiv.classList.remove('recording');
                 }
                break;
            case 'error':
                statusDiv.textContent = 'Error: ' + msg.text;
                statusDiv.classList.remove('recording', 'processing'); // Clear status indicators on error
                resetUIState(); // Reset buttons fully on error
                break;
             case 'recordingStartedUI':
                 startBtn.disabled = true;
                 deleteBtn.disabled = true;
                 statusDiv.classList.add('recording');
                 statusDiv.classList.remove('processing');
                 break;
             case 'recordingStoppedUI':
                 resetUIState(); // Use central reset function
                 break;
            case 'recordingSaved':
                 // Status might be set to 'Processing...' by extension, don't overwrite immediately
                 // statusDiv.textContent = 'Recording ready: ' + msg.filename;
                 player.src = 'data:audio/wav;base64,' + msg.data;
                 player.hidden = false;
                 deleteBtn.disabled = false; // Enable delete now
                break;
            case 'transcriptionResult':
                transcriptionDiv.textContent = msg.text || '(Transcription empty)'; // Indicate if empty
                break;
            case 'aiSuggestions':
                 latestAI = { summary: msg.summary, updated_file: msg.updated_file, raw: msg.raw };
                 aiSummary.textContent = msg.summary || 'AI processed the request.';
                 aiRaw.textContent = msg.raw || ''; aiRaw.style.display = msg.raw ? 'block' : 'none'; aiBox.hidden = false;
                 const hasEdits = !!latestAI.updated_file;
                 commitBtn.style.display = (hasEdits && currentMode === 'check') ? 'inline-block' : 'none';
                 statusDiv.classList.remove('processing'); // Processing done
                break;
            case 'mode':
                currentMode = msg.mode || currentMode;
                modeLabel.textContent = 'Mode: ' + (currentMode === 'auto' ? 'Auto Write' : (currentMode === 'check' ? 'Check & Commit' : 'Not set'));
                const hasEditsOnModeChange = (latestAI && latestAI.updated_file);
                commitBtn.style.display = (hasEditsOnModeChange && currentMode === 'check') ? 'inline-block' : 'none';
                break;
            case 'playAudio':
                 console.log('Received playAudio command in webview.');
                 audioPlayer.pause(); audioPlayer.src = '';
                 setTimeout(() => {
                     try {
                          console.log('Setting audio source...');
                          audioPlayer.src = msg.data;
                          audioPlayer.playbackRate = 1.3; // Speed
                          console.log('Attempting to play audio...');
                          const playPromise = audioPlayer.play();
                          if (playPromise) {
                              playPromise
                                 .then(() => console.log("Audio play initiated."))
                                 .catch(error => {
                                      console.error("Audio play() failed:", error);
                                      // Log specific error details if available
                                      if(error.name === 'NotAllowedError') {
                                           console.warn("Autoplay was prevented. User interaction likely needed.");
                                           statusDiv.textContent = "Audio blocked. Click panel maybe?";
                                      } else {
                                           statusDiv.textContent = "Audio playback error.";
                                      }
                                      stopSpeakBtn.style.display = 'none'; // Ensure button hidden on error
                                  });
                          } else {
                               console.warn("audioPlayer.play() did not return a promise.");
                               // Some older environments might not return a promise
                               // Button visibility handled by event listeners anyway
                          }
                     } catch (e) {
                          console.error("Error setting src or playing audio:", e);
                          statusDiv.textContent = "Error setting up audio playback.";
                          stopSpeakBtn.style.display = 'none';
                     }
                 }, 100); // Increased delay slightly more
                 break;
        }
    });
</script>
</body>
</html>`;
}


/* ----------------- Code Action Provider ----------------- */
// ... (SelectionActionProvider unchanged) ...
class SelectionActionProvider {
    provideCodeActions(document, range, context, token) {
        if (range.isEmpty) return undefined;

        const validateAction = new vscode.CodeAction('Ask AI: Validate/Improve Selection', vscode.CodeActionKind.RefactorRewrite);
        validateAction.command = { command: 'code-assistant.validateSelection', title: 'Ask AI: Validate/Improve Selection' };

        const explainAction = new vscode.CodeAction('Ask AI: Explain Selection', vscode.CodeActionKind.Refactor);
        explainAction.command = { command: 'code-assistant.explainSelection', title: 'Ask AI: Explain Selection' };

        const testAction = new vscode.CodeAction('Ask AI: Generate Unit Test', vscode.CodeActionKind.Refactor);
        testAction.command = { command: 'code-assistant.generateTest', title: 'Ask AI: Generate Unit Test' };

        return [validateAction, explainAction, testAction];
    }
}
/* ----------------- Commands for selection ----------------- */
// ... (validateSelection, explainSelection, generateTest unchanged) ...
async function validateSelection() {
     // --- UPDATED: Removed hardcoded audio/messages ---
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showInformationMessage('No text selected. Select the code you want to validate.');
        return;
    }

    const doc = editor.document;
    const selectedText = doc.getText(selection);
    const fullContent = doc.getText();
    const fileName = doc.fileName ? path.basename(doc.fileName) : 'untitled';
    const lang = doc.languageId || undefined;

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Asking AI about selection...',
        cancellable: false
    }, async (progress) => {
        try {
            const resp = await postJSONRequest('127.0.0.1', 8000, '/validate_selection', {
                filename: fileName,
                selected_text: selectedText,
                full_content: fullContent,
            }, 120000);

             // Error handling
            if (resp && resp.error) {
                 vscode.window.showErrorMessage('AI Error: ' + resp.error);
                 playAudioFeedback("An AI error occurred during validation.");
                 return;
             }
             if (!resp || typeof resp.summary === 'undefined') {
                  vscode.window.showErrorMessage('Invalid response structure from validation server.');
                  playAudioFeedback("Sorry, I received an invalid response from the server.");
                  return;
             }


            const newSnippet = resp.updated_snippet;
            const summary = resp.summary;

            playAudioFeedback(summary);

            if (newSnippet === null || newSnippet === undefined || newSnippet === selectedText) {
                vscode.window.showInformationMessage(`AI: ${summary}`);
            } else {
                const choice = await vscode.window.showWarningMessage(
                    `AI: ${summary}`, { modal: true },
                    'Apply Changes', 'Preview Changes', 'Cancel'
                );

                if (choice === 'Apply Changes') {
                    await editor.edit(editBuilder => {
                        editBuilder.replace(selection, newSnippet);
                    });
                     // Format only the selection that was changed
                     await vscode.commands.executeCommand('editor.action.formatSelection');
                     await doc.save(); // Save after applying and formatting

                } else if (choice === 'Preview Changes') {
                    try {
                        const originalDoc = await vscode.workspace.openTextDocument({ content: selectedText, language: lang });
                        const newDoc = await vscode.workspace.openTextDocument({ content: newSnippet, language: lang });
                        await vscode.commands.executeCommand('vscode.diff', originalDoc.uri, newDoc.uri, `AI Preview — ${fileName} (Selection)`);

                        const afterPreview = await vscode.window.showWarningMessage('Apply AI suggested changes to your selection?', { modal: true }, 'Apply', 'Cancel');
                        if (afterPreview === 'Apply') {
                            await editor.edit(editBuilder => {
                                editBuilder.replace(selection, newSnippet);
                            });
                             // Format only the selection that was changed
                             await vscode.commands.executeCommand('editor.action.formatSelection');
                             await doc.save(); // Save after applying and formatting
                        }
                    } catch (diffErr) {
                        console.error('Diff error', diffErr);
                        vscode.window.showErrorMessage('Failed to open diff preview: ' + diffErr.message);
                    }
                }
            }

        } catch (err) {
            console.error('Validate selection error:', err);
            vscode.window.showErrorMessage('Failed to validate selection: ' + err.message);
            playAudioFeedback("Failed to validate selection.");
        }
    });
}

// --- NEW: Command for Explain Selection ---
async function explainSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
        vscode.window.showInformationMessage('Please select the code you want explained.');
        return;
    }
    const doc = editor.document;
    const selection = editor.selection;
    const selectedText = doc.getText(selection);
    const fullContent = doc.getText();
    const fileName = path.basename(doc.fileName || 'untitled');

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Asking AI to explain...',
        cancellable: false
    }, async (progress) => {
        try {
            const resp = await postJSONRequest('127.0.0.1', 8000, '/explain_selection', {
                filename: fileName,
                selected_text: selectedText,
                full_content: fullContent,
            }, 120000);

            if (resp && resp.error) {
                 vscode.window.showErrorMessage('AI Error: ' + resp.error);
                 playAudioFeedback("Sorry, I couldn't get an explanation.");
                 return;
             }
             if (!resp || !resp.summary || !resp.explanation) {
                  vscode.window.showErrorMessage('Invalid response from explanation server.');
                  playAudioFeedback("Sorry, I received an invalid explanation response.");
                  return;
             }

            playAudioFeedback(resp.summary); // Play the short summary

            // Show the detailed explanation in a non-modal message or output channel
            vscode.window.showInformationMessage(`AI Explanation:\n${resp.explanation}`, { modal: false });
            // Or use an output channel for longer explanations:
            // const outputChannel = vscode.window.createOutputChannel("AI Code Explanation");
            // outputChannel.appendLine(`Explanation for selection in ${fileName}:\n`);
            // outputChannel.appendLine(resp.explanation);
            // outputChannel.show(true); // Bring focus to the output channel

        } catch (err) {
            console.error('Explain selection error:', err);
            vscode.window.showErrorMessage('Failed to get explanation: ' + err.message);
            playAudioFeedback("Failed to get explanation.");
        }
    });
}

// --- NEW: Command for Generate Test ---
async function generateTest() {
    const editor = vscode.window.activeTextEditor;
     // Allow generating test even if selection is slightly larger, but focus should be on a function/class
    if (!editor || editor.selection.isEmpty) {
        vscode.window.showInformationMessage('Please select the function or class you want to generate a test for.');
        return;
    }
    const doc = editor.document;
    const selection = editor.selection;
    const selectedText = doc.getText(selection);
    const fullContent = doc.getText();
    const fileName = path.basename(doc.fileName || 'untitled');
    const langId = doc.languageId; // Get language ID

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Asking AI to generate test...',
        cancellable: false
    }, async (progress) => {
        try {
            const resp = await postJSONRequest('127.0.0.1', 8000, '/generate_test', {
                filename: fileName,
                selected_text: selectedText,
                full_content: fullContent,
                language_id: langId // Pass language ID to server
            }, 180000); // Longer timeout for test generation

             if (resp && resp.error) {
                 vscode.window.showErrorMessage('AI Error: ' + resp.error);
                 playAudioFeedback("Sorry, I couldn't generate a test.");
                 return;
             }
             if (!resp || !resp.summary || !resp.test_file_content) {
                  vscode.window.showErrorMessage('Invalid response from test generation server.');
                  playAudioFeedback("Sorry, I received an invalid test response.");
                  return;
             }


            playAudioFeedback(resp.summary);

            // Open the generated test in a new untitled document
            const testDoc = await vscode.workspace.openTextDocument({
                content: resp.test_file_content,
                language: langId // Use the same language ID if appropriate, or infer from test content
            });
            await vscode.window.showTextDocument(testDoc, vscode.ViewColumn.Beside);
            vscode.window.showInformationMessage('Generated test opened in a new tab.');

        } catch (err) {
            console.error('Generate test error:', err);
            vscode.window.showErrorMessage('Failed to generate test: ' + err.message);
            playAudioFeedback("Failed to generate test.");
        }
    });
}
/* ----------------- TTS Helper ----------------- */
async function playAudioFeedback(text) {
    // ... (This function is unchanged, includes cleaning and panel check) ...
     if (!text || typeof text !== 'string' || text.trim().length === 0) {
        console.log("Skipping audio feedback for empty or invalid text.");
        return;
    }

    // Clean the text
    let cleanedText = text
        .replace(/```[\s\S]*?```/gs, ' code block ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[*_~"']/g, '')
        .replace(/[\[\]{}()]/g, '')
        .replace(/=>/g, ' implies ')
        .replace(/->/g, ' implies ')
        .replace(/!=/g, ' not equal to ')
        .replace(/===/g, ' strictly equal to ')
        .replace(/==/g, ' equal to ')
        .replace(/&&/g, ' and ')
        .replace(/\|\|/g, ' or ')
        .replace(/\s+/g, ' ')
        .trim();

     if (cleanedText.length === 0) {
         console.log("Skipping audio feedback after cleaning resulted in empty text.");
         return;
     }
     console.log(`Cleaned text for TTS: "${cleanedText}"`);


    try {
        // Ensure panel exists and is visible
        if (!voicePanelInstance) {
            if (!extensionContext) {
                console.error("Extension context not available for audio."); return;
            }
            console.log("Creating/Revealing voice panel for audio...");
            await createVoicePanel(extensionContext);
            await new Promise(resolve => setTimeout(resolve, 150)); // Delay
        } else if (!voicePanelInstance.visible) {
             console.log("Revealing voice panel for audio...");
             voicePanelInstance.reveal(vscode.ViewColumn.Beside);
             await new Promise(resolve => setTimeout(resolve, 150)); // Delay
        }

        if (!voicePanelInstance?.webview) {
             console.error("Voice panel webview invalid after create/reveal."); return;
        }

        console.log("Requesting TTS from server...");
        const resp = await postJSONRequest('127.0.0.1', 8000, '/tts', { text: cleanedText }, 20000);
        if (resp?.audio_base64) {
            console.log("Received TTS audio, sending playAudio command.");
             // Check webview one last time
            if (voicePanelInstance?.webview) {
                 voicePanelInstance.webview.postMessage({
                     command: 'playAudio',
                     data: 'data:audio/mpeg;base64,' + resp.audio_base64
                 });
            } else { console.error("Webview invalid before posting playAudio."); }
        } else {
            console.error("TTS request failed or invalid data:", resp?.error || "No audio data");
            vscode.window.setStatusBarMessage("⚠️ TTS Failed", 5000);
        }
    } catch (err) {
        console.error("Failed to get/play TTS audio:", err.message);
        vscode.window.setStatusBarMessage("⚠️ TTS Error", 5000);
    }
}


/* ----------------- Activation / Commands ----------------- */

function activate(context) {
    extensionContext = context; // Store context
    console.log('Voice Code Assistant activated');

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('code-assistant.startVoiceAssistant', async () => {
            await createVoicePanel(context);
        }),
        vscode.commands.registerCommand('code-assistant.setMode', async () => {
            const pick = await vscode.window.showQuickPick(
                 ['Auto Write (apply automatically)', 'Check & Commit (preview before apply)'],
                 { placeHolder: 'Choose Voice Assistant mode (this changes stored preference)', ignoreFocusOut: true }
             );
            if (pick) {
                 const mode = pick.startsWith('Auto') ? 'auto' : 'check';
                 await context.globalState.update('vca.mode', mode);
                 vscode.window.showInformationMessage('Voice Code Assistant mode set to: ' + (mode === 'auto' ? 'Auto Write' : 'Check & Commit'));
             }
        }),
        vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, new SelectionActionProvider(), { providedCodeActionKinds: [vscode.CodeActionKind.RefactorRewrite, vscode.CodeActionKind.Refactor]}),
        vscode.commands.registerCommand('code-assistant.validateSelection', validateSelection),
        vscode.commands.registerCommand('code-assistant.explainSelection', explainSelection), // Register new command
        vscode.commands.registerCommand('code-assistant.generateTest', generateTest)        // Register new command
    );


    // Proactive mode prompt (unchanged)
    (async () => {
        const stored = context.globalState.get('vca.mode', null);
        if (!stored) {
             const pick = await vscode.window.showQuickPick(['Auto Write (apply automatically)', 'Check & Commit (preview before apply)'], { placeHolder: 'Choose Voice Assistant mode (can change later)', ignoreFocusOut: false });
             if (pick) {
                 const mode = pick.startsWith('Auto') ? 'auto' : 'check';
                 await context.globalState.update('vca.mode', mode);
                 vscode.window.showInformationMessage('Voice Code Assistant mode set to: ' + (mode === 'auto' ? 'Auto Write' : 'Check & Commit'));
             } else {
                 if (!context.globalState.get('vca.mode')) {
                      await context.globalState.update('vca.mode', 'check');
                 }
             }
         }
    })();
}

function deactivate() {
     // Clean up resources if necessary
     extensionContext = null;
     voicePanelInstance = null; // Ensure panel reference is cleared
}

module.exports = { activate, deactivate };