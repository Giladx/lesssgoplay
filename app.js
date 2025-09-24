document.addEventListener('DOMContentLoaded', () => {
    const layersContainer = document.getElementById('layers-container');
    const openOutputBtn = document.getElementById('open-output');
    const numLayers = 4;
    let outputWindow = null;
    let audioContext;
    let audioSource;

    const layers = [];

    function initAudio() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    // Global audio file input
    const audioFileInput = document.createElement('input');
    audioFileInput.type = 'file';
    audioFileInput.accept = 'audio/*';
    audioFileInput.style.display = 'block';
    audioFileInput.style.marginTop = '10px';
    const audioLabel = document.createElement('label');
    audioLabel.innerText = 'Audio for Visualizers:';
    audioLabel.style.marginTop = '20px';
    audioLabel.style.display = 'block';
    document.getElementById('main-controls').appendChild(audioLabel);
    document.getElementById('main-controls').appendChild(audioFileInput);

    audioFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            initAudio();
            const audioUrl = URL.createObjectURL(file);
            const audio = new Audio(audioUrl);
            audio.crossOrigin = "anonymous";
            if (audioSource) {
                audioSource.disconnect();
            }
            audioSource = audioContext.createMediaElementSource(audio);
            audioSource.connect(audioContext.destination);
            audio.play();

            layers.forEach(layer => {
                if (layer.visualizer) {
                    layer.visualizer.connectAudio(audioSource);
                }
            });
        }
    });


    for (let i = 0; i < numLayers; i++) {
        const layer = {
            id: i,
            opacity: 1,
            file: null,
            fileType: null,
            element: null,
            visualizer: null,
            renderer: null,
            renderFunc: null,
            presets: [],
            currentPresetIndex: -1
        };
        layers.push(layer);

        const layerEl = document.createElement('div');
        layerEl.classList.add('layer');
        layerEl.setAttribute('data-layer', i);
        layerEl.innerHTML = `
            <h3>Layer ${i + 1}</h3>
            <div class="layer-controls">
                <label>Opacity:</label>
                <input type="range" min="0" max="1" value="1" step="0.01" class="opacity-slider" data-layer="${i}">
                <input type="file" class="file-input" data-layer="${i}" accept=".milk,.gif,.isf,.fs,.frag,.mp4">
            </div>
            <div class="layer-preview"></div>
            <div class="advanced-controls"></div>
        `;
        layersContainer.appendChild(layerEl);
    }

    openOutputBtn.addEventListener('click', () => {
        if (outputWindow && !outputWindow.closed) {
            outputWindow.focus();
            return;
        }

        outputWindow = window.open('', 'PerformanceOutput', 'width=800,height=600');
        outputWindow.document.title = "Output";
        outputWindow.document.body.style.backgroundColor = 'black';
        outputWindow.document.body.style.margin = '0';
        outputWindow.document.body.style.overflow = 'hidden';

        outputWindow.document.body.addEventListener('dblclick', () => {
            if (outputWindow.document.fullscreenElement) {
                outputWindow.document.exitFullscreen();
            } else {
                outputWindow.document.body.requestFullscreen();
            }
        });

        renderOutput();
    });

    function renderLayer(layer) {
        const previewEl = document.querySelector(`.layer[data-layer='${layer.id}'] .layer-preview`);
        previewEl.innerHTML = '';
        if (layer.element) {
            previewEl.appendChild(layer.element);
        }
        renderOutput();
    }

    function renderOutput() {
        if (!outputWindow || outputWindow.closed) {
            return;
        }

        outputWindow.document.body.innerHTML = '';

        layers.forEach(layer => {
            if (layer.element) {
                let outputEl;
                if (layer.element.tagName === 'CANVAS') {
                    outputEl = document.createElement('canvas');
                    outputEl.width = outputWindow.innerWidth;
                    outputEl.height = outputWindow.innerHeight;
                     if(layer.fileType === 'milk'){
                        const newVisualizer = Butterchurn.create(outputEl, {
                            width: outputWindow.innerWidth,
                            height: outputWindow.innerHeight,
                        });
                        if(audioSource){
                            newVisualizer.connectAudio(audioSource);
                        }
                        if (layer.visualizer) {
                            newVisualizer.loadPreset(layer.visualizer.getPreset(), 0);
                        }
                        layer.outputRenderer = () => newVisualizer.render();
                    } else if (['isf', 'fs', 'frag'].includes(layer.fileType)){
                        const newRenderer = new ISFRenderer(outputEl);
                        newRenderer.loadShader(layer.shader);
                        // copy uniforms
                        if(layer.renderer){
                            for(const uniform of layer.renderer.shader.uniforms){
                                newRenderer.setValue(uniform.name, layer.renderer.getValue(uniform.name));
                            }
                        }
                        layer.outputRenderer = () => newRenderer.draw(performance.now() / 1000);
                    }

                } else {
                    outputEl = layer.element.cloneNode(true);
                     if (outputEl.tagName === 'VIDEO') {
                        outputEl.play();
                    }
                }

                outputEl.style.position = 'absolute';
                outputEl.style.top = '0';
                outputEl.style.left = '0';
                outputEl.style.width = '100%';
                outputEl.style.height = '100%';
                outputEl.style.objectFit = 'contain';
                outputEl.style.opacity = layer.opacity;
                outputWindow.document.body.appendChild(outputEl);
            }
        });
    }

    function animationLoop() {
        layers.forEach(layer => {
            if (layer.renderFunc) {
                layer.renderFunc();
            }
            if (layer.outputRenderer) {
                layer.outputRenderer();
            }
        });
        requestAnimationFrame(animationLoop);
    }

    requestAnimationFrame(animationLoop);


    layersContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('opacity-slider')) {
            const layerId = parseInt(e.target.dataset.layer, 10);
            layers[layerId].opacity = parseFloat(e.target.value);
            renderOutput();
        }
    });

    layersContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('file-input')) {
            const layerId = parseInt(e.target.dataset.layer, 10);
            const file = e.target.files[0];
            if (file) {
                handleFile(layerId, file);
            }
        }
    });

    function handleFile(layerId, file) {
        const layer = layers[layerId];
        const fileURL = URL.createObjectURL(file);
        const fileExtension = file.name.split('.').pop().toLowerCase();

        // Cleanup old stuff
        if (layer.element && layer.element.tagName === 'VIDEO') {
            layer.element.pause();
        }
        layer.renderFunc = null;
        layer.outputRenderer = null;
        const advancedControls = document.querySelector(`.layer[data-layer='${layer.id}'] .advanced-controls`);
        advancedControls.innerHTML = '';


        layer.file = file;
        layer.fileType = fileExtension;

        switch (fileExtension) {
            case 'gif':
                handleGif(layer, fileURL);
                break;
            case 'mp4':
                handleVideo(layer, fileURL);
                break;
            case 'isf':
            case 'fs':
            case 'frag':
                handleIsf(layer, file);
                break;
            case 'milk':
                handleMilk(layer, file);
                break;
        }
    }

    function handleGif(layer, fileURL) {
        layer.element = document.createElement('img');
        layer.element.src = fileURL;
        layer.element.style.width = '100%';
        layer.element.style.height = '100%';
        layer.element.style.objectFit = 'contain';
        renderLayer(layer);
    }

    function handleVideo(layer, fileURL) {
        layer.element = document.createElement('video');
        layer.element.src = fileURL;
        layer.element.autoplay = true;
        layer.element.loop = true;
        layer.element.muted = true;
        layer.element.style.width = '100%';
        layer.element.style.height = '100%';
        layer.element.style.objectFit = 'contain';
        renderLayer(layer);
    }

    function handleIsf(layer, file) {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 150;
        layer.element = canvas;
        const renderer = new ISFRenderer(canvas);
        layer.renderer = renderer;
        const reader = new FileReader();
        reader.onload = (e) => {
            layer.shader = e.target.result;
            renderer.loadShader(layer.shader);
            layer.renderFunc = () => renderer.draw(performance.now() / 1000);
            createIsfControls(layer, renderer);
            renderLayer(layer);
        };
        reader.readAsText(file);
    }

    function createIsfControls(layer, renderer) {
        const advancedControls = document.querySelector(`.layer[data-layer='${layer.id}'] .advanced-controls`);
        advancedControls.innerHTML = '';

        renderer.shader.uniforms.forEach(uniform => {
            const controlWrapper = document.createElement('div');
            const label = document.createElement('label');
            label.innerText = uniform.name;
            controlWrapper.appendChild(label);

            let input;
            switch (uniform.type) {
                case 'float':
                    input = document.createElement('input');
                    input.type = 'range';
                    input.min = uniform.min || 0;
                    input.max = uniform.max || 1;
                    input.step = 0.01;
                    input.value = uniform.value;
                    input.addEventListener('input', (e) => {
                        renderer.setValue(uniform.name, parseFloat(e.target.value));
                    });
                    break;
                case 'color':
                    input = document.createElement('input');
                    input.type = 'color';
                    input.value = uniform.value;
                     input.addEventListener('input', (e) => {
                        renderer.setValue(uniform.name, e.target.value);
                    });
                    break;
                case 'bool':
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.checked = uniform.value;
                     input.addEventListener('change', (e) => {
                        renderer.setValue(uniform.name, e.target.checked);
                    });
                    break;
            }

            if (input) {
                controlWrapper.appendChild(input);
                advancedControls.appendChild(controlWrapper);
            }
        });
    }


    function handleMilk(layer, file) {
        initAudio();
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 150;
        layer.element = canvas;

        const reader = new FileReader();
        reader.onload = (e) => {
            let preset;
            try {
                preset = JSON.parse(e.target.result);
            } catch (err) {
                preset = milkdrop.convert(e.target.result);
            }

            layer.presets.push(preset);
            layer.currentPresetIndex = layer.presets.length - 1;

            if (!layer.visualizer) {
                const visualizer = Butterchurn.create(canvas, {
                    width: 200,
                    height: 150,
                });
                layer.visualizer = visualizer;
                if (audioSource) {
                    visualizer.connectAudio(audioSource);
                }
            }
            
            layer.visualizer.loadPreset(preset, 0.0);
            layer.renderFunc = () => layer.visualizer.render();
            createMilkControls(layer);
            renderLayer(layer);
        };
        reader.readAsText(file);
    }

    function createMilkControls(layer) {
        const advancedControls = document.querySelector(`.layer[data-layer='${layer.id}'] .advanced-controls`);
        advancedControls.innerHTML = '';

        const nextBtn = document.createElement('button');
        nextBtn.innerText = 'Next Preset';
        nextBtn.addEventListener('click', () => {
            if (layer.presets.length > 1) {
                layer.currentPresetIndex = (layer.currentPresetIndex + 1) % layer.presets.length;
                layer.visualizer.loadPreset(layer.presets[layer.currentPresetIndex], 2.0);
            }
        });
        advancedControls.appendChild(nextBtn);

        const prevBtn = document.createElement('button');
        prevBtn.innerText = 'Prev Preset';
        prevBtn.addEventListener('click', () => {
            if (layer.presets.length > 1) {
                layer.currentPresetIndex = (layer.currentPresetIndex - 1 + layer.presets.length) % layer.presets.length;
                layer.visualizer.loadPreset(layer.presets[layer.currentPresetIndex], 2.0);
            }
        });
        advancedControls.appendChild(prevBtn);
    }
});