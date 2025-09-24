document.addEventListener("DOMContentLoaded", () => {
  const layersContainer = document.getElementById("layers-container");
  const openOutputBtn = document.getElementById("open-output");
  const numLayers = 4;
  let outputWindow = null;
  let audioContext;
  let sourceNode;
  let delayedAudible;

  const layers = [];
  const presets = {};

  function initAudio() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function initPresets() {
    console.log("window.all:", window.all);
    if (window.all && window.all.default) {
      Object.assign(presets, window.all.default);
      console.log("presets:", presets);
    } else {
      setTimeout(initPresets, 100);
    }
  }

  // Global audio controls
  const audioControls = document.createElement("div");
  audioControls.innerHTML = `
        <label>Audio:</label>
        <input type="file" id="audio-file-input" accept="audio/*">
        <button id="mic-input-btn">Use Mic</button>
    `;
  document.getElementById("main-controls").appendChild(audioControls);

  const audioFileInput = document.getElementById("audio-file-input");
  audioFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      initAudio();
      const audioUrl = URL.createObjectURL(file);
      const audio = new Audio(audioUrl);
      audio.crossOrigin = "anonymous";
      if (sourceNode) {
        sourceNode.disconnect();
      }
      sourceNode = audioContext.createMediaElementSource(audio);
      connectAudio(sourceNode);
      audio.play();
    }
  });

  const micInputBtn = document.getElementById("mic-input-btn");
  micInputBtn.addEventListener("click", () => {
    initAudio();
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (sourceNode) {
        sourceNode.disconnect();
      }
      sourceNode = audioContext.createMediaStreamSource(stream);
      connectAudio(sourceNode);
    });
  });

  function connectAudio(source) {
    if (delayedAudible) {
      delayedAudible.disconnect();
    }
    delayedAudible = audioContext.createDelay();
    delayedAudible.delayTime.value = 0.26;
    source.connect(delayedAudible);
    delayedAudible.connect(audioContext.destination);

    layers.forEach((layer) => {
      if (layer.visualizer) {
        layer.visualizer.connectAudio(delayedAudible);
      }
    });
  }

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
      presetKeys: [],
      currentPresetIndex: -1,
    };
    layers.push(layer);

    const layerEl = document.createElement("div");
    layerEl.classList.add("layer");
    layerEl.setAttribute("data-layer", i);
    layerEl.innerHTML = `
            <h3>Layer ${i + 1}</h3>
            <div class="layer-controls">
                <label>Opacity:</label>
                <input type="range" min="0" max="1" value="1" step="0.01" class="opacity-slider" data-layer="${i}">
                <input type="file" class="file-input" data-layer="${i}" accept=".gif,.isf,.fs,.frag,.mp4,.json">
                <button class="load-presets-btn" data-layer="${i}">Load MilkDrop Presets</button>
            </div>
            <div class="layer-preview"></div>
            <div class="advanced-controls"></div>
        `;
    layersContainer.appendChild(layerEl);
  }

  openOutputBtn.addEventListener("click", () => {
    if (outputWindow && !outputWindow.closed) {
      outputWindow.focus();
      return;
    }

    outputWindow = window.open("", "PerformanceOutput", "width=800,height=600");
    outputWindow.document.title = "Output";
    outputWindow.document.body.style.backgroundColor = "black";
    outputWindow.document.body.style.margin = "0";
    outputWindow.document.body.style.overflow = "hidden";

    outputWindow.document.body.addEventListener("dblclick", () => {
      if (outputWindow.document.fullscreenElement) {
        outputWindow.document.exitFullscreen();
      } else {
        outputWindow.document.body.requestFullscreen();
      }
    });

    renderOutput();
  });

  function renderLayer(layer) {
    console.log("Rendering layer:", layer.id);
    const previewEl = document.querySelector(
      `.layer[data-layer='${layer.id}'] .layer-preview`,
    );
    previewEl.innerHTML = "";
    if (layer.element) {
      previewEl.appendChild(layer.element);
    }
    renderOutput();
  }

  function renderOutput() {
    if (!outputWindow || outputWindow.closed) {
      return;
    }

    outputWindow.document.body.innerHTML = "";

    layers.forEach((layer) => {
      if (layer.element) {
        let outputEl;
        if (layer.element.tagName === "CANVAS") {
          outputEl = document.createElement("canvas");
          outputEl.width = outputWindow.innerWidth;
          outputEl.height = outputWindow.innerHeight;
          if (layer.fileType === "milk") {
            const newVisualizer = butterchurn.createVisualizer(
              audioContext,
              outputEl,
              {
                width: outputWindow.innerWidth,
                height: outputWindow.innerHeight,
              },
            );
            if (delayedAudible) {
              newVisualizer.connectAudio(delayedAudible);
            }
            if (layer.currentPreset) {
              newVisualizer.loadPreset(layer.currentPreset, 0);
            }
            layer.outputRenderer = () => newVisualizer.render();
          } else if (["isf", "fs", "frag"].includes(layer.fileType)) {
            const newRenderer = new ISFRenderer(outputEl);
            newRenderer.loadShader(layer.shader);
            // copy uniforms
            if (layer.renderer) {
              for (const uniform of layer.renderer.shader.uniforms) {
                newRenderer.setValue(
                  uniform.name,
                  layer.renderer.getValue(uniform.name),
                );
              }
            }
            layer.outputRenderer = () =>
              newRenderer.draw(performance.now() / 1000);
          }
        } else {
          outputEl = layer.element.cloneNode(true);
          if (outputEl.tagName === "VIDEO") {
            outputEl.play();
          }
        }

        outputEl.style.position = "absolute";
        outputEl.style.top = "0";
        outputEl.style.left = "0";
        outputEl.style.width = "100%";
        outputEl.style.height = "100%";
        outputEl.style.objectFit = "contain";
        outputEl.style.opacity = layer.opacity;
        outputWindow.document.body.appendChild(outputEl);
      }
    });
  }

  function animationLoop() {
    layers.forEach((layer) => {
      if (layer.renderFunc) {
        console.log("Rendering layer in animationLoop:", layer.id);
        layer.renderFunc();
      }
      if (layer.outputRenderer) {
        layer.outputRenderer();
      }
    });
    requestAnimationFrame(animationLoop);
  }

  requestAnimationFrame(animationLoop);

  layersContainer.addEventListener("input", (e) => {
    if (e.target.classList.contains("opacity-slider")) {
      const layerId = parseInt(e.target.dataset.layer, 10);
      layers[layerId].opacity = parseFloat(e.target.value);
      renderOutput();
    }
  });

  layersContainer.addEventListener("change", (e) => {
    if (e.target.classList.contains("file-input")) {
      const layerId = parseInt(e.target.dataset.layer, 10);
      const file = e.target.files[0];
      if (file) {
        handleFile(layerId, file);
      }
    }
  });

  layersContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("load-presets-btn")) {
      const layerId = parseInt(e.target.dataset.layer, 10);
      handleMilk(layers[layerId]);
    }
  });

  function handleFile(layerId, file) {
    const layer = layers[layerId];
    const fileURL = URL.createObjectURL(file);
    const fileExtension = file.name.split(".").pop().toLowerCase();

    // Cleanup old stuff
    if (layer.element && layer.element.tagName === "VIDEO") {
      layer.element.pause();
    }
    layer.renderFunc = null;
    layer.outputRenderer = null;
    const advancedControls = document.querySelector(
      `.layer[data-layer='${layer.id}'] .advanced-controls`,
    );
    advancedControls.innerHTML = "";

    layer.file = file;
    layer.fileType = fileExtension;

    switch (fileExtension) {
      case "gif":
        handleGif(layer, fileURL);
        break;
      case "mp4":
        handleVideo(layer, fileURL);
        break;
      case "isf":
      case "fs":
      case "frag":
        handleIsf(layer, file);
        break;
      case "json":
        handleJsonPreset(layer, file);
        break;
    }
  }

  function handleGif(layer, fileURL) {
    layer.element = document.createElement("img");
    layer.element.src = fileURL;
    layer.element.style.width = "100%";
    layer.element.style.height = "100%";
    layer.element.style.objectFit = "contain";
    renderLayer(layer);
  }

  function handleVideo(layer, fileURL) {
    layer.element = document.createElement("video");
    layer.element.src = fileURL;
    layer.element.autoplay = true;
    layer.element.loop = true;
    layer.element.muted = true;
    layer.element.style.width = "100%";
    layer.element.style.height = "100%";
    layer.element.style.objectFit = "contain";
    renderLayer(layer);
  }

  function handleIsf(layer, file) {
    const canvas = document.createElement("canvas");
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
    const advancedControls = document.querySelector(
      `.layer[data-layer='${layer.id}'] .advanced-controls`,
    );
    advancedControls.innerHTML = "";

    renderer.shader.uniforms.forEach((uniform) => {
      const controlWrapper = document.createElement("div");
      const label = document.createElement("label");
      label.innerText = uniform.name;
      controlWrapper.appendChild(label);

      let input;
      switch (uniform.type) {
        case "float":
          input = document.createElement("input");
          input.type = "range";
          input.min = uniform.min || 0;
          input.max = uniform.max || 1;
          input.step = 0.01;
          input.value = uniform.value;
          input.addEventListener("input", (e) => {
            renderer.setValue(uniform.name, parseFloat(e.target.value));
          });
          break;
        case "color":
          input = document.createElement("input");
          input.type = "color";
          input.value = uniform.value;
          input.addEventListener("input", (e) => {
            renderer.setValue(uniform.name, e.target.value);
          });
          break;
        case "bool":
          input = document.createElement("input");
          input.type = "checkbox";
          input.checked = uniform.value;
          input.addEventListener("change", (e) => {
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

  function handleMilk(layer) {
    console.log("handleMilk called");
    if (Object.keys(presets).length === 0) {
      alert("Presets are still loading. Please try again in a moment.");
      return;
    }

    initAudio();
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 150;
    layer.element = canvas;
    layer.fileType = "milk";

    layer.presets = presets;
    layer.presetKeys = Object.keys(presets);
    layer.currentPresetIndex = Math.floor(
      Math.random() * layer.presetKeys.length,
    );

    const preset = layer.presets[layer.presetKeys[layer.currentPresetIndex]];
    layer.currentPreset = preset;

    const visualizer = butterchurn.createVisualizer(audioContext, canvas, {
      width: 200,
      height: 150,
    });
    layer.visualizer = visualizer;
    if (delayedAudible) {
      visualizer.connectAudio(delayedAudible);
    }

    visualizer.loadPreset(preset, 0.0);
    layer.renderFunc = () => layer.visualizer.render();
    createMilkControls(layer);
    renderLayer(layer);
  }

  function createMilkControls(layer) {
    const advancedControls = document.querySelector(
      `.layer[data-layer='${layer.id}'] .advanced-controls`,
    );
    advancedControls.innerHTML = "";

    const presetSelect = document.createElement("select");
    for (let i = 0; i < layer.presetKeys.length; i++) {
      const opt = document.createElement("option");
      opt.innerHTML =
        layer.presetKeys[i].substring(0, 60) +
        (layer.presetKeys[i].length > 60 ? "..." : "");
      opt.value = i;
      presetSelect.appendChild(opt);
    }
    presetSelect.value = layer.currentPresetIndex;
    presetSelect.addEventListener("change", (e) => {
      layer.currentPresetIndex = parseInt(e.target.value, 10);
      layer.visualizer.loadPreset(
        layer.presets[layer.presetKeys[layer.currentPresetIndex]],
        2.0,
      );
    });
    advancedControls.appendChild(presetSelect);

    const nextBtn = document.createElement("button");
    nextBtn.innerText = "Next Preset";
    nextBtn.addEventListener("click", () => {
      if (layer.presetKeys.length > 1) {
        layer.currentPresetIndex =
          (layer.currentPresetIndex + 1) % layer.presetKeys.length;
        layer.visualizer.loadPreset(
          layer.presets[layer.presetKeys[layer.currentPresetIndex]],
          2.0,
        );
        presetSelect.value = layer.currentPresetIndex;
      }
    });
    advancedControls.appendChild(nextBtn);

    const prevBtn = document.createElement("button");
    prevBtn.innerText = "Prev Preset";
    prevBtn.addEventListener("click", () => {
      if (layer.presetKeys.length > 1) {
        layer.currentPresetIndex =
          (layer.currentPresetIndex - 1 + layer.presetKeys.length) %
          layer.presetKeys.length;
        layer.visualizer.loadPreset(
          layer.presets[layer.presetKeys[layer.currentPresetIndex]],
          2.0,
        );
        presetSelect.value = layer.currentPresetIndex;
      }
    });
    advancedControls.appendChild(prevBtn);
  }

  function handleJsonPreset(layer, file) {
    initAudio();
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 150;
    layer.element = canvas;
    layer.fileType = "milk";

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const preset = JSON.parse(e.target.result);
        layer.currentPreset = preset;

        const visualizer = butterchurn.createVisualizer(audioContext, canvas, {
          width: 200,
          height: 150,
        });
        layer.visualizer = visualizer;
        if (delayedAudible) {
          visualizer.connectAudio(delayedAudible);
        }

        visualizer.loadPreset(preset, 0.0);
        layer.renderFunc = () => layer.visualizer.render();
        renderLayer(layer);
      } catch (error) {
        console.error("Error loading preset:", error);
        alert("Error loading preset: " + error.message);
      }
    };
    reader.readAsText(file);
  }

  initPresets();
});
