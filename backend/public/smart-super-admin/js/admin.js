(() => {
  const base = "/smart-super-admin";
  const sidebar = document.getElementById("smart-sidebar"),
    toggle = document.querySelector("[data-sidebar-toggle]"),
    close = document.querySelector("[data-sidebar-close]");
  function setSidebar(open) {
    if (!sidebar) return;
    sidebar.classList.toggle("open", open);
    toggle?.setAttribute("aria-expanded", String(open));
    const workspace = document.querySelector(".smart-workspace");
    if (workspace) workspace.inert = open;
    (open ? close : toggle)?.focus();
  }
  toggle?.addEventListener("click", () => setSidebar(true));
  close?.addEventListener("click", () => setSidebar(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setSidebar(false);
    if (event.key === "Tab" && sidebar?.classList.contains("open")) {
      const nodes = [...sidebar.querySelectorAll("a[href],button,summary")];
      if (event.shiftKey && document.activeElement === nodes[0]) {
        event.preventDefault();
        nodes.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
        event.preventDefault();
        nodes[0].focus();
      }
    }
  });
  window.matchMedia("(min-width:901px)").addEventListener("change", (event) => {
    if (event.matches) {
      sidebar?.classList.remove("open");
      if (document.querySelector(".smart-workspace"))
        document.querySelector(".smart-workspace").inert = false;
      toggle?.setAttribute("aria-expanded", "false");
    }
  });
  document
    .querySelectorAll("[data-print]")
    .forEach((button) =>
      button.addEventListener("click", () => window.print()),
    );
  document.querySelectorAll("[data-page-limit]").forEach((select) =>
    select.addEventListener("change", () => {
      window.location.href = select.value;
    }),
  );
  document.querySelectorAll("form[data-confirm]").forEach((form) =>
    form.addEventListener("submit", (event) => {
      if (!window.confirm(form.dataset.confirm)) event.preventDefault();
    }),
  );
  const search = document.querySelector("[data-org-search]"),
    results = document.querySelector("[data-org-results]");
  let timer,
    sequence = 0;
  search?.addEventListener("input", () => {
    clearTimeout(timer);
    const request = ++sequence;
    timer = setTimeout(async () => {
      try {
        const response = await fetch(
          base + "/organization-options?q=" + encodeURIComponent(search.value),
        );
        if (!response.ok) throw new Error("Could not load organizations");
        const rows = await response.json();
        if (request !== sequence) return;
        results.replaceChildren();
        for (const row of rows) {
          const link = document.createElement("a");
          link.href = base + "/select-org/" + row.id;
          link.textContent = row.name + " (#" + row.id + ")";
          results.append(link);
        }
      } catch (error) {
        results.textContent = error.message;
      }
    }, 200);
  });
  const featureEditor = document.querySelector("[data-feature-editor]");
  if (featureEditor) {
    const picker = featureEditor.querySelector("[data-feature-picker]"),
      rows = featureEditor.querySelector("[data-feature-rows]"),
      status = featureEditor.querySelector("[data-feature-status]");
    function append(feature) {
      const featureId = String(feature.feature_id || feature.id);
      if ([...rows.children].some((row) => row.dataset.featureId === featureId))
        return;
      const row = document.createElement("div");
      row.className = "feature-row";
      row.dataset.featureId = featureId;
      const title = document.createElement("strong");
      title.textContent =
        feature.feature_name || feature.label || "Feature " + featureId;
      row.append(title);
      const identifier = document.createElement("input");
      identifier.type = "hidden";
      identifier.name = "feature_id[]";
      identifier.value = featureId;
      row.append(identifier);
      for (const [name, label, value, max] of [
        ["feature_value[]", "Value", feature.value || "", 20000],
        ["feature_unit[]", "Unit", feature.unit || "", 50],
      ]) {
        const wrapper = document.createElement("label");
        wrapper.textContent = label;
        const input = document.createElement("input");
        input.className = "form-control";
        input.name = name;
        input.value = value;
        input.maxLength = max;
        wrapper.append(input);
        row.append(wrapper);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-outline-danger";
      button.dataset.featureRemove = "";
      button.textContent = "Remove";
      row.append(button);
      rows.append(row);
    }
    featureEditor
      .querySelector("[data-feature-add]")
      ?.addEventListener("click", () => {
        if (picker.value)
          append({
            id: picker.value,
            label: picker.selectedOptions[0].textContent,
          });
      });
    rows.addEventListener("click", (event) => {
      const button = event.target.closest("[data-feature-remove]");
      if (button) button.closest(".feature-row").remove();
    });
    featureEditor
      .querySelector("[data-plan-features]")
      ?.addEventListener("click", async () => {
        const plan = document.querySelector("[name=plan_id]");
        if (!plan?.value) {
          status.textContent = "Select a plan first.";
          return;
        }
        try {
          const response = await fetch(
            base +
              "/subscription-plan-features/" +
              encodeURIComponent(plan.value),
          );
          if (!response.ok) throw new Error("Could not load plan features");
          for (const feature of await response.json()) append(feature);
          status.textContent =
            "Plan features loaded. Existing overrides were preserved.";
        } catch (error) {
          status.textContent = error.message;
        }
      });
  }
  const commandForm = document.querySelector("[data-command-form]");
  if (commandForm) {
    const source = document.getElementById("command-source"),
      host = document.getElementById("command-editor"),
      status = commandForm.querySelector("[data-command-status]"),
      answer = commandForm.querySelector("[data-command-answer]");
    let editor,
      pollTimer,
      pollGeneration = 0;
    if (window.require?.config) {
      const cdn = "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/";
      const worker = URL.createObjectURL(
        new Blob(
          [
            `self.MonacoEnvironment={baseUrl:${JSON.stringify(cdn)}};importScripts(${JSON.stringify(cdn + "vs/base/worker/workerMain.js")});`,
          ],
          { type: "text/javascript" },
        ),
      );
      window.MonacoEnvironment = { getWorkerUrl: () => worker };
      window.require.config({ paths: { vs: cdn + "vs" } });
      window.require(["vs/editor/editor.main"], () => {
        host.hidden = false;
        source.hidden = true;
        source.required = false;
        editor = window.monaco.editor.create(host, {
          value: source.value,
          language: "javascript",
          theme: "vs-dark",
          automaticLayout: true,
          minimap: { enabled: false },
        });
      });
    }
    commandForm
      .querySelector("[data-command-format]")
      .addEventListener("click", () =>
        editor?.getAction("editor.action.formatDocument").run(),
      );
    commandForm
      .querySelector("[data-command-language]")
      .addEventListener("change", (event) => {
        if (editor)
          window.monaco.editor.setModelLanguage(
            editor.getModel(),
            event.target.value,
          );
      });
    function showResult(data) {
      answer.replaceChildren();
      if (["iframe", "html"].includes(data.answer_type)) {
        const frame = document.createElement("iframe");
        frame.setAttribute("sandbox", "");
        frame.title = "Command result";
        frame.style.width = "100%";
        frame.style.height = "720px";
        frame.srcdoc = String(data.answer || "");
        answer.append(frame);
        return;
      }
      if (
        data.answer_type === "imageURL" &&
        /^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(
          data.answer || "",
        )
      ) {
        const image = document.createElement("img");
        image.src = data.answer;
        image.alt = "Command result";
        answer.append(image);
      } else {
        let value = data.answer || "";
        if (data.answer_type === "json") {
          try {
            value = JSON.stringify(JSON.parse(value), null, 2);
          } catch {}
        }
        answer.textContent = value;
      }
    }
    async function startPolling(commandId) {
      clearTimeout(pollTimer);
      const generation = ++pollGeneration;
      let attempts = 0;
      const poll = async () => {
        try {
          const result = await fetch(base + "/command-result/" + commandId);
          const current = await result.json();
          if (generation !== pollGeneration) return;
          if (!result.ok)
            throw new Error(current.message || "Result lookup failed");
          status.textContent = current.command_status;
          showResult(current);
          if (current.command_status !== "executed" && attempts++ < 60)
            pollTimer = setTimeout(poll, 1000);
          else if (current.command_status !== "executed")
            status.textContent =
              "Still pending. Reopen the command from the commands list.";
        } catch (error) {
          if (generation === pollGeneration) status.textContent = error.message;
        }
      };
      await poll();
    }
    showResult({
      answer: answer.textContent,
      answer_type: commandForm.dataset.answerType,
    });
    if (
      Number(commandForm.dataset.commandId) > 0 &&
      status.textContent.trim() !== "executed"
    )
      startPolling(commandForm.dataset.commandId);
    commandForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearTimeout(pollTimer);
      pollGeneration++;
      const button = commandForm.querySelector("[type=submit]");
      button.disabled = true;
      try {
        const payload = Object.fromEntries(new FormData(commandForm));
        payload.script = editor ? editor.getValue() : source.value;
        const response = await fetch(base + "/command/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message || "Command submission failed");
        status.textContent = "Command queued: " + data.id;
        await startPolling(data.id);
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
    window.addEventListener("pagehide", () => {
      clearTimeout(pollTimer);
      pollGeneration++;
    });
  }
})();
