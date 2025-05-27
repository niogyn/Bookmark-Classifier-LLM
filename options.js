// options.js

document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    // const testApiKeyBtn = document.getElementById('testApiKey'); // Now verifyModelSelectionBtn
    const verifyModelSelectionBtn = document.getElementById('verifyModelSelectionBtn');
    const apiKeyStatus = document.getElementById('apiKeyStatus');
    const toggleApiKeyVisibilityBtn = document.getElementById('toggleApiKeyVisibility');

    // const enableRetroactiveCheckbox = document.getElementById('enableRetroactive'); // REMOVED
    const saveSettingsBtn = document.getElementById('saveSettings');
    const settingsStatus = document.getElementById('settingsStatus');
    const saveAllSettingsHeader = document.getElementById('saveAllSettingsHeader');
    const saveAllSettingsDescription = document.getElementById('saveAllSettingsDescription');

    // Elements for NUX Step 4 and NUX-triggered Bulk Reclassification
    const nuxStep4 = document.getElementById('nuxStep4');
    const nuxBulkReclassifyOfferSection = document.getElementById('nuxBulkReclassifyOfferSection');
    const nuxStartReclassifyBtn = document.getElementById('nuxStartReclassifyBtn');
    const nuxSkipReclassifyBtn = document.getElementById('nuxSkipReclassifyBtn');
    const nuxReclassifyUiContainer = document.getElementById('nuxReclassifyUiContainer');
    const nuxReclassifyProgressBar = document.getElementById('nuxReclassifyProgressBar');
    const nuxReclassifyProgressText = document.getElementById('nuxReclassifyProgressText');
    const nuxReclassifyLogOutput = document.getElementById('nuxReclassifyLogOutput');
    const nuxReclassifyReportOutput = document.getElementById('nuxReclassifyReportOutput');
    const nuxReclassifyConfirmControls = document.getElementById('nuxReclassifyConfirmControls');
    const nuxConfirmReclassifyBtn = document.getElementById('nuxConfirmReclassifyBtn');
    const nuxCancelReclassifyBtn = document.getElementById('nuxCancelReclassifyBtn');
    const nuxReclassifyStatus = document.getElementById('nuxReclassifyStatus');

    // Elements for regular Advanced Bulk Reclassification (already present)
    const startReclassifyGroup = document.getElementById('startReclassifyGroup'); // Added
    const startReclassifyAnalysisBtn = document.getElementById('startReclassifyAnalysisBtn');
    const reclassifyReportContainer = document.getElementById('reclassifyReportContainer');
    const reclassifyReportOutput = document.getElementById('reclassifyReportOutput');
    const reclassifyActionButtons = document.getElementById('reclassifyActionButtons'); // Added
    const confirmReclassifyBtn = document.getElementById('confirmReclassifyBtn');
    const cancelReclassifyBtn = document.getElementById('cancelReclassifyBtn');
    const reclassifyStatus = document.getElementById('reclassifyStatus');
    // New elements for progress and logging
    const reclassifyProgressBar = document.getElementById('reclassifyProgressBar');
    const reclassifyProgressText = document.getElementById('reclassifyProgressText');
    const reclassifyLogOutput = document.getElementById('reclassifyLogOutput');

    // Log the elements to check if they are found
    console.log("Initial check for bulk reclassify DOM elements (options.js):");
    console.log({
        startReclassifyGroup,
        startReclassifyAnalysisBtn,
        reclassifyReportContainer,
        reclassifyActionButtons,
        confirmReclassifyBtn,
        cancelReclassifyBtn
    });

    let nuxModeActive = false;
    let nuxApiKeyEntered = false;
    let nuxTestSuccessful = false; // API Key test passed
    let nuxModelsFetched = false;
    let nuxModelSelected = false;
    let nuxInitialConfigSaved = false; // True if API key & model are saved (NUX Step 1-3 done)
    let nuxBulkReclassifyActive = false; 

    // Helper to send messages to background script
    async function sendMessageToBackground(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.error && !response.models && !response.success) { // Check for specific error responses
                    // For model fetching, response.error might exist with response.models: null
                    // For API validation, response.error might exist with response.success: false
                    // Only reject if it's a clear, primary error without other expected data.
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });
    }

    function updateNuxVisuals(currentApiKey, currentSelectedModel) {
        if (!nuxModeActive) {
            // NUX is not active
            if (nuxPanel) nuxPanel.style.display = 'none';
            if (nuxBulkReclassifyOfferSection) nuxBulkReclassifyOfferSection.style.display = 'none';
            if (nuxReclassifyUiContainer) nuxReclassifyUiContainer.style.display = 'none';

            const standardSections = [apiSection, modelSelectionSection, saveAllSettingsSection, bulkReclassifySection, advancedSettingsSection];
            standardSections.forEach(section => {
                if (section) {
                    section.style.display = 'block';
                    section.classList.remove('nux-disabled-section', 'fade-in', 'fade-out');
                }
            });
            
            if (saveSettingsBtn) saveSettingsBtn.textContent = 'Save Settings';
            if (saveAllSettingsHeader) saveAllSettingsHeader.textContent = 'Save All Settings';
            if (saveAllSettingsDescription) saveAllSettingsDescription.textContent = 'Make sure to save all your changes across sections.';
            // Non-NUX save button state is simpler
            if (saveSettingsBtn) saveSettingsBtn.disabled = !apiKeyInput.value.trim(); 
            return;
        }

        // NUX mode is active.
        if (nuxPanel) nuxPanel.style.display = 'block';

        const allNuxSections = [apiSection, modelSelectionSection, saveAllSettingsSection, nuxBulkReclassifyOfferSection];
        allNuxSections.forEach(section => {
            if (section && section.style.display !== 'none') {
                section.classList.remove('fade-in');
                section.classList.add('fade-out');
                setTimeout(() => { if(section) section.style.display = 'none'; }, 500); 
            }
        });
        if (bulkReclassifySection) bulkReclassifySection.style.display = 'none'; 
        if (advancedSettingsSection) advancedSettingsSection.style.display = 'none';

        [nuxStep1, nuxStep2, nuxStep3, nuxStep4, nuxStep5].forEach(step => {
            if (step) step.classList.remove('active', 'completed');
        });
        // Remove pulse from all relevant buttons initially
        if(fetchModelsBtn) fetchModelsBtn.classList.remove('pulse');
        if(modelSelect) modelSelect.classList.remove('pulse');
        if(verifyModelSelectionBtn) verifyModelSelectionBtn.classList.remove('pulse');
        if(saveSettingsBtn) saveSettingsBtn.classList.remove('pulse'); // General save button
        if(nuxStartReclassifyBtn) nuxStartReclassifyBtn.classList.remove('pulse');

        setTimeout(() => {
            if (nuxInitialConfigSaved) { // NUX Step 5: Bulk Reclassify Offer
                if (nuxStep1) nuxStep1.classList.add('completed');
                if (nuxStep2) nuxStep2.classList.add('completed'); // Combined API+Fetch into Step 1 & 2
                if (nuxStep3) nuxStep3.classList.add('completed'); // Model select is part of Step 3
                if (nuxStep4) nuxStep4.classList.add('completed'); // Verify/Save is Step 4
                if (nuxStep5) { nuxStep5.style.display = 'list-item'; nuxStep5.classList.add('active'); }
                
                if (nuxBulkReclassifyOfferSection) {
                    nuxBulkReclassifyOfferSection.style.display = 'block';
                    nuxBulkReclassifyOfferSection.classList.remove('fade-out');
                    nuxBulkReclassifyOfferSection.classList.add('fade-in');
                    if(nuxStartReclassifyBtn) nuxStartReclassifyBtn.classList.add('pulse');
                }
            } else if (nuxModelsFetched && nuxTestSuccessful) { // NUX Step 3 & 4 (Select Model & Verify/Save)
                if (nuxStep1) nuxStep1.classList.add('completed'); // API Key entry
                if (nuxStep2) nuxStep2.classList.add('completed'); // Models Fetched (implies API key was okay)
                if (nuxStep3) nuxStep3.classList.add('active');    // Select Model active
                
                if (modelSelectionSection) {
                    modelSelectionSection.style.display = 'block';
                    modelSelectionSection.classList.remove('fade-out');
                    modelSelectionSection.classList.add('fade-in');
                }
                if (modelSelect) {
                    modelSelect.disabled = false;
                    if (!nuxModelSelected) modelSelect.classList.add('pulse');
                }
                if (verifyModelSelectionBtn) verifyModelSelectionBtn.disabled = !nuxModelSelected;
                if (nuxModelSelected && verifyModelSelectionBtn) verifyModelSelectionBtn.classList.add('pulse');

            } else { // NUX Step 1 & 2 (API Key Entry & Fetch Models)
                if (nuxStep1) nuxStep1.classList.add('active'); // API Key entry active
                if (apiSection) {
                    apiSection.style.display = 'block';
                    apiSection.classList.remove('fade-out');
                    apiSection.classList.add('fade-in');
                }
                if (apiKeyInput) apiKeyInput.disabled = false;
                if (fetchModelsBtn) {
                    fetchModelsBtn.disabled = !nuxApiKeyEntered;
                    if (nuxApiKeyEntered) fetchModelsBtn.classList.add('pulse');
                }
                if (modelSelect) modelSelect.disabled = true;
                if (verifyModelSelectionBtn) verifyModelSelectionBtn.disabled = true;
            }
            // The main save button (saveSettingsBtn) is not used in this NUX part.
            // updateSaveButtonState(); // This will be handled by specific NUX step logic for verifyModelSelectionBtn
        }, 500);
    }
    
    // Helper function to check if models have been successfully fetched (e.g., dropdown has actual models)
    function modelsFetchedSuccessfully() {
        return modelSelect.options.length > 0 && 
               modelSelect.options[0].value !== "" && 
               !modelSelect.options[0].textContent.toLowerCase().includes("fetch model") &&
               !modelSelect.options[0].textContent.toLowerCase().includes("no compatible models") &&
               !modelSelect.options[0].textContent.toLowerCase().includes("error fetching models");
    }


    // Load saved settings & Initialize NUX if needed
    initializeOptionsPage();

    async function initializeOptionsPage() {
        const nuxResult = await chrome.storage.local.get(['nuxInProgress']);
        const syncSettings = await new Promise(resolve =>
            chrome.storage.sync.get(['geminiApiKey', 'selectedGeminiModel', 'nuxCompleted'], resolve)
        );

        if (syncSettings.nuxCompleted) {
            nuxModeActive = false;
            nuxInitialConfigSaved = true; 
            nuxApiKeyEntered = true; 
            nuxTestSuccessful = true; 
            nuxModelsFetched = true; 
            nuxModelSelected = true;
            chrome.storage.local.remove(['nuxInProgress']);
        } else {
            nuxModeActive = true; 
            const localState = await chrome.storage.local.get(['nuxApiKeyEntered', 'nuxTestSuccessful', 'nuxModelsFetched', 'nuxModelSelected', 'nuxInitialConfigSaved']);
            
            if (!nuxResult.nuxInProgress) { // Fresh NUX start
                await chrome.storage.local.set({ nuxInProgress: true, nuxApiKeyEntered: false, nuxTestSuccessful: false, nuxModelsFetched: false, nuxModelSelected: false, nuxInitialConfigSaved: false });
                nuxApiKeyEntered = false;
                nuxTestSuccessful = false;
                nuxModelsFetched = false;
                nuxModelSelected = false;
                nuxInitialConfigSaved = false;
            } else { // NUX in progress, load state from local storage
                nuxApiKeyEntered = localState.nuxApiKeyEntered || !!syncSettings.geminiApiKey;
                nuxTestSuccessful = localState.nuxTestSuccessful || false; // Must be explicitly set by fetch success
                nuxModelsFetched = localState.nuxModelsFetched || false;
                nuxModelSelected = localState.nuxModelSelected || !!syncSettings.selectedGeminiModel;
                nuxInitialConfigSaved = localState.nuxInitialConfigSaved || false;
            }
        }
        
        loadSettings(syncSettings); 
    }


    function loadSettings(loadedSyncSettings) {
        const processResult = async (result) => { 
            if (result.geminiApiKey) {
                apiKeyInput.value = result.geminiApiKey;
                // nuxApiKeyEntered is set by initializeOptionsPage or input listener
                // fetchModelsBtn state is handled by updateNuxVisuals
                await populateModelsFromStorageOrFetch(result.selectedGeminiModel, result.geminiApiKey);
            } else {
                updateApiKeyStatus('API Key not found. Please enter your Gemini API Key.', 'error');
                if(modelSelect) modelSelect.innerHTML = '<option value="">-- Enter API Key and Fetch Models --</option>';
                if(modelSelect) modelSelect.disabled = true;
                if(fetchModelsBtn) fetchModelsBtn.disabled = true;
            }
            updateNuxVisuals(result.geminiApiKey, result.selectedGeminiModel);
        };

        if (loadedSyncSettings) {
            processResult(loadedSyncSettings);
        } else {
            chrome.storage.sync.get(['geminiApiKey', 'selectedGeminiModel'], processResult);
        }
    }

    async function populateModelsFromStorageOrFetch(selectedModelName, apiKeyFromLoad) {
        const apiKey = apiKeyFromLoad || apiKeyInput.value.trim();
        if (!apiKey && !selectedModelName) { // Allow populating if only selectedModelName is present (e.g. from storage)
             // If no API key, and no previously selected model (which implies models were fetched before)
            if (!selectedModelName) {
                modelSelect.innerHTML = '<option value="">-- Enter API Key and Fetch Models --</option>';
                modelSelect.disabled = true;
                fetchModelsBtn.disabled = !apiKeyInput.value.trim(); // Disable fetch if no API key
                return;
            }
        }

        const storage = await new Promise(resolve => chrome.storage.local.get(['availableGeminiModels'], resolve));
        
        if (storage.availableGeminiModels && storage.availableGeminiModels.length > 0) {
            updateModelDropdown(storage.availableGeminiModels, selectedModelName);
            modelSelect.disabled = false;
            if (apiKeyFromLoad) updateApiKeyStatus('API Key loaded. Models restored from cache.', 'info');
            nuxModelsFetched = true; // Models are available from cache
        } else if (apiKey) { 
            await fetchAndPopulateModels(apiKey, selectedModelName); // This will set nuxModelsFetched internally
        } else if (selectedModelName && (!storage.availableGeminiModels || storage.availableGeminiModels.length === 0)) {
            // A model was selected, but no models in cache and no API key to fetch now.
            // This might happen if API key was cleared after setup.
            updateModelStatus('Previously selected model loaded, but model list is empty. Re-enter API key and fetch if needed.', 'warning');
            modelSelect.innerHTML = `<option value="${selectedModelName}">${selectedModelName.replace("models/", "")} (cached selection)</option>`;
            modelSelect.value = selectedModelName; // Ensure it's selected
            modelSelect.disabled = false;
        } else {
            // Default state if no API key and no cached models
            modelSelect.innerHTML = '<option value="">-- Enter API Key and Fetch Models --</option>';
            modelSelect.disabled = true;
        }
        // updateSaveButtonState(); // Not for the main save button in this NUX part
        if (nuxModeActive) { 
            nuxModelSelected = !!modelSelect.value;
            // No need to call updateNuxVisuals here, it's called by the change listener of modelSelect
            // await chrome.storage.local.set({ nuxModelSelected }); // This will be set by modelSelect listener
        }
    }
    
    apiKeyInput.addEventListener('input', async () => {
        const apiKey = apiKeyInput.value.trim();
        nuxApiKeyEntered = !!apiKey;
        // When API key changes, reset subsequent NUX flags as they depend on the new key
        nuxTestSuccessful = false; 
        nuxModelsFetched = false;
        nuxModelSelected = false;
        // nuxInitialConfigSaved should remain as is, only save operation changes it.

        if (!apiKey) {
            if(modelSelect) modelSelect.innerHTML = '<option value="">-- Enter API Key and Fetch Models --</option>';
            if(modelSelect) modelSelect.disabled = true;
            updateApiKeyStatus('API Key not found. Please enter your Gemini API Key.', 'error');
        } else {
            updateApiKeyStatus('API Key entered. Click \'Fetch Available Models\'.', 'info');
        }
        if (nuxModeActive) { 
            await chrome.storage.local.set({ nuxApiKeyEntered, nuxTestSuccessful, nuxModelsFetched, nuxModelSelected });
            updateNuxVisuals(apiKey, null);
        }
    });


    toggleApiKeyVisibilityBtn.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleApiKeyVisibilityBtn.textContent = 'Hide';
        } else {
            apiKeyInput.type = 'password';
            toggleApiKeyVisibilityBtn.textContent = 'Show';
        }
    });

    // REMOVED saveApiKeyBtn event listener

    fetchModelsBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) { 
            updateApiKeyStatus('Please enter an API Key before fetching models.', 'error');
            return;
        }
        // No nuxTestSuccessful check here as per new flow
        await fetchAndPopulateModels(apiKey);
    });

    async function fetchAndPopulateModels(apiKey, modelToSelectAfterFetch) {
        updateModelStatus('Fetching available models...', 'info');
        if(modelSelect) modelSelect.disabled = true;
        if(fetchModelsBtn) fetchModelsBtn.disabled = true;
        // if (saveSettingsBtn) saveSettingsBtn.disabled = true; // Not the main save button for this NUX step

        try {
            const response = await sendMessageToBackground({ action: "fetchAvailableModels", apiKey: apiKey });

            if (response.error && !response.models) {
                throw new Error(response.error);
            }
            
            const availableModels = response.models;

            if (availableModels && availableModels.length > 0) {
                updateModelDropdown(availableModels, modelToSelectAfterFetch || (await getSelectedModelFromStorage()));
                updateModelStatus(`Found ${availableModels.length} compatible models. Please select one.`, 'success');
                updateApiKeyStatus('API Key validated and models fetched successfully!', 'success'); 
                if(modelSelect) modelSelect.disabled = false;
                nuxModelsFetched = true; 
                nuxTestSuccessful = true; // Implicitly true if models were fetched
            } else {
                const errorMessage = response.error || 'No compatible models found for generateContent.';
                updateModelStatus(errorMessage, 'error');
                if(modelSelect) modelSelect.innerHTML = '<option value="">-- No compatible models --</option>';
                nuxModelsFetched = false; 
                nuxTestSuccessful = false; // Fetch failed, so API key might be invalid or no models
            }
        } catch (error) {
            console.error("Error fetching models via background:", error);
            updateModelStatus(`Error fetching models: ${error.message}.`, 'error');
            updateApiKeyStatus(`Error fetching models: ${error.message}. Check API key.`, 'error');
            if(modelSelect) modelSelect.innerHTML = '<option value="">-- Error fetching models --</option>';
            nuxModelsFetched = false; 
            nuxTestSuccessful = false;
        }
        if(fetchModelsBtn) fetchModelsBtn.disabled = false; // Re-enable in case of failure, user might want to retry
        if (nuxModeActive) { 
            await chrome.storage.local.set({ nuxTestSuccessful, nuxModelsFetched });
            updateNuxVisuals(apiKeyInput.value.trim(), modelSelect.value);
        }
    }

    function updateModelDropdown(models, selectedModelName) {
        const previouslySelectedValue = modelSelect.value;
        modelSelect.innerHTML = ''; // Clear existing options

        if (!models || models.length === 0) {
            modelSelect.innerHTML = '<option value="">-- No models available --</option>';
            modelSelect.disabled = true;
            updateSaveButtonState();
            return;
        }

        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            const description = model.description && typeof model.description === 'string' ? model.description.substring(0, 50) + '...' : '(No description)';
            option.textContent = `${model.displayName} (${model.name.replace("models/", "")}) - ${description}`;
            if (model.name === selectedModelName) {
                option.selected = true;
            }
            modelSelect.appendChild(option);
        });
        modelSelect.disabled = false;
        
        // If a model was previously selected and is still in the list, re-select it.
        // Otherwise, if selectedModelName was provided (e.g. from storage), use that.
        // Otherwise, the first model in the list will be selected by default.
        if (selectedModelName && modelSelect.querySelector(`option[value="${selectedModelName}"]`)) {
            modelSelect.value = selectedModelName;
        } else if (previouslySelectedValue && modelSelect.querySelector(`option[value="${previouslySelectedValue}"]`)) {
            modelSelect.value = previouslySelectedValue;
        }
        
        // updateSaveButtonState(); // Not for the main save button in this NUX part
        if (nuxModeActive) { 
            nuxModelSelected = !!modelSelect.value;
            // No need to call updateNuxVisuals here, it's called by the change listener of modelSelect
            // await chrome.storage.local.set({ nuxModelSelected }); // This will be set by modelSelect listener
        }
    }

    async function getSelectedModelFromStorage() {
        return new Promise(resolve => {
            chrome.storage.sync.get(['selectedGeminiModel'], result => resolve(result.selectedGeminiModel));
        });
    }

    // testApiKeyBtn.addEventListener('click', async () => { // OLD Listener
    // });

    if (verifyModelSelectionBtn) {
        verifyModelSelectionBtn.addEventListener('click', async () => {
            const apiKey = apiKeyInput.value.trim();
            const selectedModel = modelSelect.value;

            if (!apiKey || !selectedModel) {
                updateSettingsStatus('API Key and Model must be selected to verify and save.', 'error');
                return;
            }

            // This button now acts as the save/confirm for this NUX stage
            await new Promise(resolve => chrome.storage.sync.set({ 
                geminiApiKey: apiKey,
                selectedGeminiModel: selectedModel,
            }, resolve));
            
            nuxInitialConfigSaved = true; 
            if (nuxStep3) nuxStep3.classList.add('completed'); // Mark model selection as done
            if (nuxStep4) nuxStep4.classList.add('active', 'completed'); // Mark save as done

            updateSettingsStatus('Configuration saved! Proceed to the optional next step.', 'success');
            updateApiKeyStatus('API Key saved.', 'success');
            updateModelStatus(`Model "${selectedModel.replace("models/","")}" saved.`, 'success');
            
            if (nuxModeActive) {
                await chrome.storage.local.set({ nuxInitialConfigSaved, nuxModelSelected: !!selectedModel });
                updateNuxVisuals(apiKey, selectedModel);
            }
        });
    }

    if (modelSelect) {
        modelSelect.addEventListener('change', async () => {
            nuxModelSelected = !!modelSelect.value;
            if (nuxModeActive) {
                await chrome.storage.local.set({ nuxModelSelected });
                updateNuxVisuals(apiKeyInput.value.trim(), modelSelect.value);
            }
        });
    }

    function updateSaveButtonState() { // This is for the main save button, not NUX verify
        const apiKey = apiKeyInput.value.trim();
        if (nuxModeActive) {
            // During NUX, the main save button is not the primary action for initial config.
            // It might be hidden or disabled by updateNuxVisuals logic for sections.
            if (saveSettingsBtn) saveSettingsBtn.disabled = true; 
        } else {
            if (saveSettingsBtn) saveSettingsBtn.disabled = !apiKey;
        }
    }


    if (saveSettingsBtn) { // This is the general save button, mostly for non-NUX or post-NUX bulk reclassify offer
        saveSettingsBtn.addEventListener('click', async () => {
            // ... existing save logic, but ensure it doesn't conflict with NUX verifyModelSelectionBtn
            // This button should primarily be for non-NUX mode or later NUX stages if applicable.
            const apiKey = apiKeyInput.value.trim();
            const selectedModel = modelSelect.value;

            if (!apiKey) {
                updateSettingsStatus('API Key cannot be empty.', 'error');
                apiKeyStatus.textContent = 'API Key cannot be empty.';
                apiKeyStatus.className = 'status error';
                return;
            }
            // If NUX is somehow active and this button is clicked, it implies something is off
            // or it's for a later NUX stage not covered by verifyModelSelectionBtn.
            // For now, assume it's mainly for non-NUX.
            if (nuxModeActive && !nuxInitialConfigSaved) {
                updateSettingsStatus('Please complete the NUX steps using the guided buttons.', 'error');
                return;
            }
            
            await new Promise(resolve => chrome.storage.sync.set({ 
                geminiApiKey: apiKey,
                selectedGeminiModel: selectedModel, 
            }, resolve));
            
            let message = 'Settings saved successfully!';
            console.log("Settings saved: API Key, Model.");

            if (nuxModeActive && nuxInitialConfigSaved) {
                // This case should ideally not be hit if nuxBulkReclassifyOfferSection is the active one
                // and has its own buttons.
                message = 'Settings saved. You can proceed with optional steps or use the extension.';
            }
            
            updateSettingsStatus(message, 'success');
            if (!(apiKeyStatus.className.includes('error') && apiKeyStatus.textContent.includes('empty'))) {
                 updateApiKeyStatus('API Key saved.', 'success');
            }
            if (selectedModel) {
                 updateModelStatus(`Model "${selectedModel.replace("models/","")}" saved.`, 'success');
            } else if (apiKey) {
                // modelStatus might already reflect an issue if models weren't fetched/selected
            }
            // No call to updateNuxVisuals here if it's for non-NUX or if NUX is already past initial config.
        });
    } else {
        console.error("Save Settings button not found!");
    }

    function updateApiKeyStatus(message, type) {
        apiKeyStatus.textContent = message;
        apiKeyStatus.className = `status ${type}`;
    }

    function updateModelStatus(message, type) {
        modelStatus.textContent = message;
        modelStatus.className = `status ${type}`;
    }

    function updateSettingsStatus(message, type) {
        settingsStatus.textContent = message;
        settingsStatus.className = `status ${type}`;
        // Do not clear model status when general settings are saved, it might contain important info.
        // modelStatus.className = 'status'; 
        // modelStatus.textContent = '';
    }
    
    resetSettingsBtn.addEventListener('click', async () => {
        if (confirm("Are you sure you want to reset all extension settings to their defaults? This action cannot be undone and will require you to set up the API key and model again.")) {
            try {
                await new Promise(resolve => chrome.storage.sync.clear(resolve));
                await new Promise(resolve => chrome.storage.local.clear(resolve));
                console.log("All extension settings have been reset.");

                apiKeyInput.value = '';
                enableRetroactiveCheckbox.checked = false;
                modelSelect.innerHTML = '<option value="">-- Enter API Key and Fetch Models --</option>';
                modelSelect.disabled = true;
                fetchModelsBtn.disabled = true;
                saveSettingsBtn.disabled = true; // Should be re-enabled by updateNuxVisuals if conditions met
                testApiKeyBtn.style.display = 'none';
                
                updateApiKeyStatus('Settings reset. Please configure your API Key.', 'info');
                updateModelStatus('', 'info');
                updateSettingsStatus('All settings have been reset to default.', 'success');

                await chrome.storage.local.set({ nuxInProgress: true });
                nuxModeActive = true; 
                nuxInitialConfigSaved = false; // Reset this state flag
                nuxApiKeyEntered = false; nuxModelsFetched = false; nuxModelSelected = false; nuxTestSuccessful = false;
                
                // Manually reset NUX visual state
                if (nuxPanel) nuxPanel.style.display = 'block';
                if (nuxStep1) nuxStep1.classList.remove('completed');
                if (nuxStep2) nuxStep2.classList.remove('completed');
                if (nuxStep3) nuxStep3.classList.remove('completed');
                if (nuxStep4) nuxStep4.classList.remove('completed'); // Reset NUX step 4 as well
                if (nuxStep5) nuxStep5.style.display = 'none'; // Hide NUX step 5
                if (nuxBulkReclassifyOfferSection) nuxBulkReclassifyOfferSection.style.display = 'none';
                
                updateNuxVisuals('', null, false, false); // Pass all NUX flags as false

                alert("Settings have been reset. The page will now guide you through the setup again.");
            } catch (error) {
                console.error("Error resetting settings:", error);
                updateSettingsStatus('Failed to reset settings. Check console.', 'error');
            }
        }
    });

    // --- Bulk Reclassification Logic ---


    if (startReclassifyAnalysisBtn) {
        startReclassifyAnalysisBtn.addEventListener('click', async () => {
            const apiKey = apiKeyInput.value.trim();
            const selectedModel = modelSelect.value;

            if (!apiKey || !selectedModel) {
                updateElementStatus(reclassifyStatus, "API Key and a selected Model are required to start reclassification.", "error");
                return;
            }

            if (!confirm("Starting a bulk reclassification will analyze all your bookmarks. This may take a long time and consume API credits. Are you sure you want to proceed?")) {
                return;
            }

            // Defensive checks for DOM elements
            if (!reclassifyReportContainer || !reclassifyActionButtons || !reclassifyReportOutput || !reclassifyProgressBar || !reclassifyProgressText || !reclassifyLogOutput) {
                console.error("One or more UI elements for reclassification are missing in startReclassifyAnalysisBtn handler.");
                updateElementStatus(reclassifyStatus, "UI Error: Could not find all necessary report elements.", "error");
                return;
            }
             if (!startReclassifyGroup) { // Check for startReclassifyGroup as well
                console.error("startReclassifyGroup is null in startReclassifyAnalysisBtn handler");
                updateElementStatus(reclassifyStatus, "UI Error: startReclassifyGroup not found.", "error");
                startReclassifyAnalysisBtn.disabled = false; // Re-enable button if we can't proceed
                return;
            }


            updateElementStatus(reclassifyStatus, "Starting analysis... This may take a while. Please do not close this page.", "info");
            startReclassifyAnalysisBtn.disabled = true; 
            
            reclassifyReportContainer.style.display = 'block'; 
            reclassifyReportOutput.style.display = 'none'; 
            reclassifyActionButtons.style.display = 'none'; 
            if(confirmReclassifyBtn) confirmReclassifyBtn.disabled = true;

            reclassifyReportOutput.textContent = 'Analyzing...';
            reclassifyProgressBar.style.width = '0%';
            reclassifyProgressText.textContent = '0 / 0';
            reclassifyLogOutput.innerHTML = ''; 
            addLogToWindow(reclassifyLogOutput, "Starting analysis...", "info");


            try {
                const response = await sendMessageToBackground({
                    action: "startBulkReclassifyAnalysis",
                    apiKey: apiKey, 
                    selectedModel: selectedModel
                });

                if (response.error) {
                    throw new Error(response.error);
                }

                // Ensure elements still exist before modifying
                if (!startReclassifyGroup || !reclassifyActionButtons || !reclassifyReportOutput) {
                    console.error("UI elements (startReclassifyGroup or reclassifyActionButtons or reclassifyReportOutput) became null during analysis response handling.");
                    updateElementStatus(reclassifyStatus, "UI Error: Elements disappeared during operation.", "error");
                    startReclassifyAnalysisBtn.disabled = false; // Try to reset
                    if(startReclassifyGroup) startReclassifyGroup.style.display = 'flex'; else console.error("Cannot show startReclassifyGroup, it's null");
                    if(reclassifyActionButtons) reclassifyActionButtons.style.display = 'none'; else console.error("Cannot hide reclassifyActionButtons, it's null");
                    return;
                }

                if (response.report) {
                    reclassifyReportOutput.textContent = response.report;
                    reclassifyReportOutput.style.display = 'block'; 
                    
                    startReclassifyGroup.style.display = 'none'; 
                    reclassifyActionButtons.style.display = 'flex'; 
                    if(confirmReclassifyBtn) confirmReclassifyBtn.disabled = false; 
                    if(cancelReclassifyBtn) cancelReclassifyBtn.disabled = false; 

                    updateElementStatus(reclassifyStatus, "Analysis complete. Review the report and confirm or cancel.", "success");
                   
                } else {
                    updateElementStatus(reclassifyStatus, "Analysis finished but no report was generated.", "warning");
                    startReclassifyAnalysisBtn.disabled = false; 
                    startReclassifyGroup.style.display = 'flex'; 
                    reclassifyActionButtons.style.display = 'none'; 
                }
            } catch (error) {
                console.error("Error during reclassification analysis:", error);
                updateElementStatus(reclassifyStatus, `Analysis failed: ${error.message}`, "error");
                startReclassifyAnalysisBtn.disabled = false; 
                if (startReclassifyGroup) startReclassifyGroup.style.display = 'flex'; else console.error("Cannot show startReclassifyGroup on error, it's null");
                if (reclassifyActionButtons) reclassifyActionButtons.style.display = 'none'; else console.error("Cannot hide reclassifyActionButtons on error, it's null");
            }
        });
    }

    if (confirmReclassifyBtn) {
        confirmReclassifyBtn.addEventListener('click', async () => {
            if (!confirm("Are you absolutely sure you want to apply these reclassification changes? This will modify your existing bookmark structure.")) {
                return;
            }

            // Defensive checks
            if (!reclassifyReportContainer || !startReclassifyGroup || !reclassifyLogOutput) {
                console.error("One or more UI elements for reclassification are missing in confirmReclassifyBtn handler.");
                updateElementStatus(reclassifyStatus, "UI Error: Could not find all necessary report/control elements.", "error");
                if(confirmReclassifyBtn) confirmReclassifyBtn.disabled = false; // Re-enable
                if(cancelReclassifyBtn) cancelReclassifyBtn.disabled = false;   // Re-enable
                return;
            }

            updateElementStatus(reclassifyStatus, "Applying changes...", "info");
            confirmReclassifyBtn.disabled = true;
            if(cancelReclassifyBtn) cancelReclassifyBtn.disabled = true; 

            try {
                const applyResponse = await sendMessageToBackground({ action: "confirmBulkReclassify" });
                if (applyResponse.error) {
                    throw new Error(applyResponse.error);
                }
                updateElementStatus(reclassifyStatus, applyResponse.message || "Reclassification applied successfully!", "success");
                addLogToWindow(reclassifyLogOutput, applyResponse.message || "Reclassification applied!", "success");

                if (confirm("Reclassification complete. Do you want to scan for and delete empty bookmark folders now?")) {
                    updateElementStatus(reclassifyStatus, "Scanning for empty folders...", "info");
                    addLogToWindow(reclassifyLogOutput, "Starting empty folder cleanup...", "info");
                    const cleanResponse = await sendMessageToBackground({ action: "cleanEmptyFolders" });
                    if (cleanResponse.error) throw new Error(cleanResponse.error); 
                    updateElementStatus(reclassifyStatus, cleanResponse.message || "Empty folder cleanup finished.", "success");
                    addLogToWindow(reclassifyLogOutput, cleanResponse.message || "Empty folder cleanup finished.", "success");
                } else {
                    updateElementStatus(reclassifyStatus, "Skipped empty folder cleanup.", "info");
                    addLogToWindow(reclassifyLogOutput, "Skipped empty folder cleanup.", "info");
                }
                
                reclassifyReportContainer.style.display = 'none'; 
                startReclassifyGroup.style.display = 'flex'; 
                if(startReclassifyAnalysisBtn) startReclassifyAnalysisBtn.disabled = false; 
                updateElementStatus(reclassifyStatus, "Bulk reclassification process complete. Ready for new analysis.", "info");

            } catch (error) {
                console.error("Error applying reclassification or cleaning folders:", error);
                updateElementStatus(reclassifyStatus, `Failed to apply changes or clean folders: ${error.message}`, "error");
                if(confirmReclassifyBtn) confirmReclassifyBtn.disabled = false;
                if(cancelReclassifyBtn) cancelReclassifyBtn.disabled = false;
            }
        });
    }

    if (cancelReclassifyBtn) {
        cancelReclassifyBtn.addEventListener('click', async () => { 
            // Defensive checks
            if (!reclassifyReportContainer || !startReclassifyGroup || !reclassifyLogOutput || !reclassifyProgressBar || !reclassifyProgressText || !reclassifyReportOutput) {
                console.error("One or more UI elements for reclassification are missing in cancelReclassifyBtn handler.");
                updateElementStatus(reclassifyStatus, "UI Error: Could not find all necessary report/control elements for cancel.", "error");
                return;
            }

            addLogToWindow(reclassifyLogOutput, "User cancelled reclassification analysis review.", "warning");

            reclassifyReportContainer.style.display = 'none'; 
            reclassifyReportOutput.textContent = 'Report will appear here...'; 
            reclassifyProgressBar.style.width = '0%';
            reclassifyProgressText.textContent = '0 / 0';

            startReclassifyGroup.style.display = 'flex'; 
            if(startReclassifyAnalysisBtn) startReclassifyAnalysisBtn.disabled = false; 

            updateElementStatus(reclassifyStatus, "Reclassification analysis cancelled.", "info");

            try {
                await sendMessageToBackground({ action: "cancelBulkReclassification" });
                console.log("Cancellation request sent to background process for bulk reclassification.");
            } catch (error) {
                console.error("Error sending cancellation request:", error);
                updateElementStatus(reclassifyStatus, "Reclassification analysis cancelled. Error sending cancellation signal.", "error");
            }
        });
    }

    // Listen for progress messages from the background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "bulkReclassifyProgress") {
            let progressBar, progressText, logOutput;
            if (nuxBulkReclassifyActive) {
                progressBar = nuxReclassifyProgressBar;
                progressText = nuxReclassifyProgressText;
                logOutput = nuxReclassifyLogOutput;
            } else {
                progressBar = reclassifyProgressBar;
                progressText = reclassifyProgressText;
                logOutput = reclassifyLogOutput;
            }

            if (request.log && logOutput) {
                addLogToWindow(logOutput, request.log, request.logType || 'normal');
            }
            if (typeof request.processed === 'number' && typeof request.total === 'number') {
                const percentage = request.total > 0 ? (request.processed / request.total) * 100 : 0;
                if (progressBar) progressBar.style.width = `${percentage}%`;
                if (progressText) progressText.textContent = `${request.processed} / ${request.total}`;
            }
            if (request.statusUpdate) {
                // For NUX, update nuxReclassifyStatus, otherwise regular reclassifyStatus
                if (nuxBulkReclassifyActive && nuxReclassifyStatus) {
                    updateElementStatus(nuxReclassifyStatus, request.statusUpdate, request.statusType || 'info');
                } else if (reclassifyStatus) {
                    updateElementStatus(reclassifyStatus, request.statusUpdate, request.statusType || 'info');
                }
            }
            return false; // No response needed for progress updates
        }
        return false; // Important for other listeners, if any
    });

    // Generic log function for both NUX and advanced reclassify log windows
    function addLogToWindow(logWindowElement, message, type = 'normal') {
        if (logWindowElement) {
            const logEntry = document.createElement('div');
            logEntry.classList.add('log-entry');
            if (type) {
                logEntry.classList.add(type);
            }
            logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
            logWindowElement.appendChild(logEntry);
            logWindowElement.scrollTop = logWindowElement.scrollHeight; // Auto-scroll to bottom
        }
    }

    // Generic status update function
    function updateElementStatus(element, message, type) {
        if (element) {
            element.textContent = message;
            element.className = `status ${type}`;
        }
    }

    // --- NUX Bulk Reclassification Event Listeners ---
    if (nuxStartReclassifyBtn) {
        nuxStartReclassifyBtn.addEventListener('click', async () => {
            const apiKey = apiKeyInput.value.trim();
            const selectedModel = modelSelect.value;

            if (!apiKey || !selectedModel) {
                updateElementStatus(nuxReclassifyStatus, "Cannot start NUX reclassification: API Key or Model is missing from saved config.", "error");
                return;
            }
            if (!confirm("This will analyze your existing bookmarks to suggest a new organization. It may take some time and use API credits. Continue?")) {
                return;
            }
            nuxBulkReclassifyActive = true;
            nuxReclassifyUiContainer.style.display = 'block';
            nuxReclassifyReportOutput.style.display = 'none';
            nuxReclassifyConfirmControls.style.display = 'none';
            if (nuxReclassifyProgressBar) nuxReclassifyProgressBar.style.width = '0%';
            if (nuxReclassifyProgressText) nuxReclassifyProgressText.textContent = '0 / 0';
            if (nuxReclassifyLogOutput) nuxReclassifyLogOutput.innerHTML = '';
            addLogToWindow(nuxReclassifyLogOutput, "Starting NUX reclassification analysis...", "info");
            updateElementStatus(nuxReclassifyStatus, "Analysis in progress...", "info");
            nuxStartReclassifyBtn.disabled = true;
            nuxSkipReclassifyBtn.disabled = true;

            try {
                const response = await sendMessageToBackground({ action: "startBulkReclassifyAnalysis" });
                if (response.error) throw new Error(response.error);
                if (response.report) {
                    nuxReclassifyReportOutput.textContent = response.report;
                    nuxReclassifyReportOutput.style.display = 'block';
                    nuxReclassifyConfirmControls.style.display = 'flex'; // Use flex for button group
                    nuxConfirmReclassifyBtn.disabled = false;
                    updateElementStatus(nuxReclassifyStatus, "NUX analysis complete. Review the report.", "success");
                    if (response.totalBookmarks && nuxReclassifyProgressBar && nuxReclassifyProgressText) {
                         nuxReclassifyProgressBar.style.width = '100%';
                         nuxReclassifyProgressText.textContent = `${response.totalBookmarks} / ${response.totalBookmarks}`;
                    }
                } else {
                    throw new Error("NUX analysis completed but no report was generated.");
                }
            } catch (error) {
                console.error("Error during NUX reclassification analysis:", error);
                updateElementStatus(nuxReclassifyStatus, `NUX analysis failed: ${error.message}`, "error");
            } finally {
                // Don't re-enable start/skip here, user proceeds with confirm/cancel for the report
                // nuxStartReclassifyBtn.disabled = false; 
                // nuxSkipReclassifyBtn.disabled = false;
            }
        });
    }

    if (nuxSkipReclassifyBtn) {
        nuxSkipReclassifyBtn.addEventListener('click', async () => {
            console.log("NUX: User skipped bulk reclassification.");
            await new Promise(resolve => chrome.storage.sync.set({ nuxCompleted: true }, resolve));
            await chrome.storage.local.remove(['nuxInProgress']);
            nuxModeActive = false; // Set to false BEFORE calling updateNuxVisuals
            nuxInitialConfigSaved = false; 
            nuxBulkReclassifyActive = false;
            updateSettingsStatus("Setup complete! You can manage settings below.", "success");
            updateNuxVisuals(apiKeyInput.value.trim(), modelSelect.value); // This will now show normal UI
            updateSaveButtonState();
        });
    }

    if (nuxConfirmReclassifyBtn) {
        nuxConfirmReclassifyBtn.addEventListener('click', async () => {
            if (!confirm("This will apply the suggested reclassification to your bookmarks. Afterwards, empty folders will be scanned and you'll be asked to confirm their deletion. This action cannot be undone. Proceed?")) {
                return;
            }
            updateElementStatus(nuxReclassifyStatus, "Applying NUX reclassification changes...", "info");
            nuxConfirmReclassifyBtn.disabled = true;
            nuxCancelReclassifyBtn.disabled = true;

            try {
                const applyResponse = await sendMessageToBackground({ action: "confirmBulkReclassify" });
                if (applyResponse.error) throw new Error(applyResponse.error);
                updateElementStatus(nuxReclassifyStatus, applyResponse.message || "NUX reclassification applied! Cleaning empty folders next...", "success");
                addLogToWindow(nuxReclassifyLogOutput, applyResponse.message || "NUX reclassification applied!", "success");

                // Now, trigger empty folder cleanup
                if (confirm("Reclassification complete. Do you want to scan for and delete empty bookmark folders now?")) {
                    updateElementStatus(nuxReclassifyStatus, "Scanning for empty folders...", "info");
                    addLogToWindow(nuxReclassifyLogOutput, "Starting empty folder cleanup...", "info");
                    const cleanResponse = await sendMessageToBackground({ action: "cleanEmptyFolders" });
                    if (cleanResponse.error) throw new Error(cleanResponse.error);
                    updateElementStatus(nuxReclassifyStatus, cleanResponse.message || "Empty folder cleanup finished.", "success");
                    addLogToWindow(nuxReclassifyLogOutput, cleanResponse.message || "Empty folder cleanup finished.", "success");
                } else {
                    addLogToWindow(nuxReclassifyLogOutput, "Skipped empty folder cleanup.", "info");
                }

                // Finalize NUX
                await new Promise(resolve => chrome.storage.sync.set({ nuxCompleted: true }, resolve));
                await chrome.storage.local.remove(['nuxInProgress']);
                nuxModeActive = false; // Set to false BEFORE calling updateNuxVisuals
                nuxInitialConfigSaved = false; 
                nuxBulkReclassifyActive = false;
                updateSettingsStatus("Setup and initial organization complete!", "success");
                updateNuxVisuals(apiKeyInput.value.trim(), modelSelect.value); // This will now show normal UI
                updateSaveButtonState();

            } catch (error) {
                console.error("Error during NUX confirm/cleanup reclassification:", error);
                updateElementStatus(nuxReclassifyStatus, `NUX application/cleanup failed: ${error.message}`, "error");
                nuxCancelReclassifyBtn.disabled = false; // Re-enable cancel if confirm fails mid-way
            }
        });
    }

    if (nuxCancelReclassifyBtn) {
        nuxCancelReclassifyBtn.addEventListener('click', async () => {
            updateElementStatus(nuxReclassifyStatus, "NUX reclassification analysis cancelled.", "info");
            addLogToWindow(nuxReclassifyLogOutput, "NUX analysis cancelled by user.", "warning");
            if(nuxReclassifyUiContainer) nuxReclassifyUiContainer.style.display = 'none';
            if(nuxStartReclassifyBtn) nuxStartReclassifyBtn.disabled = false;
            if(nuxSkipReclassifyBtn) nuxSkipReclassifyBtn.disabled = false;
            nuxBulkReclassifyActive = false;
            // If user cancels this NUX step, they are still in NUX but haven't completed step 5.
            // We should keep them on the nuxBulkReclassifyOfferSection or revert to it.
            // The nuxInitialConfigSaved is still true.
            if (nuxModeActive) {
                await chrome.storage.local.set({ nuxBulkReclassifyActive });
                // updateNuxVisuals will show the nuxBulkReclassifyOfferSection again
                updateNuxVisuals(apiKeyInput.value.trim(), modelSelect.value);
            }
            try {
                await sendMessageToBackground({ action: "cancelBulkReclassification" });
            } catch (error) {
                console.error("Error sending NUX cancellation request:", error);
            }
        });
    }

});
