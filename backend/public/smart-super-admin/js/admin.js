(() => {
  const base = "/smart-super-admin";
  const sidebar = document.getElementById("smart-sidebar"),
    toggle = document.querySelector("[data-sidebar-toggle]"),
    close = document.querySelector("[data-sidebar-close]");
  const backdrop = document.querySelector("[data-sidebar-backdrop]");
  const collapse = document.querySelector("[data-sidebar-collapse]");
  const desktop = window.matchMedia("(min-width:992px)");
  const sidebarMenu = sidebar?.querySelector("[data-sidebar-scroll]");
  const sidebarStateKey = "smartSuperAdmin.sidebarState";
  function readSidebarState() {
    try {
      const state = JSON.parse(sessionStorage.getItem(sidebarStateKey) || "{}");
      return state && typeof state === "object" ? state : {};
    } catch {
      return {};
    }
  }
  function saveSidebarState() {
    if (!sidebarMenu) return;
    try {
      sessionStorage.setItem(
        sidebarStateKey,
        JSON.stringify({
          scrollTop: sidebarMenu.scrollTop,
          groups: Object.fromEntries(
            [...sidebarMenu.querySelectorAll("[data-sidebar-group]")].map(
              (group) => [group.dataset.sidebarGroup, group.open],
            ),
          ),
        }),
      );
    } catch {}
  }
  const savedSidebarState = readSidebarState();
  if (sidebarMenu && Number.isFinite(savedSidebarState.scrollTop))
    sidebarMenu.scrollTop = savedSidebarState.scrollTop;
  sidebarMenu?.querySelectorAll("[data-sidebar-group]").forEach((group) => {
    const isActive = group.querySelector('[aria-current="page"]');
    const savedOpen = savedSidebarState.groups?.[group.dataset.sidebarGroup];
    if (isActive) group.open = true;
    else if (typeof savedOpen === "boolean") group.open = savedOpen;
    group.addEventListener("toggle", saveSidebarState);
  });
  sidebarMenu?.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (
      !link ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (link.target && link.target !== "_self")
    )
      return;
    const destination = new URL(link.href, window.location.href);
    if (destination.origin === window.location.origin) saveSidebarState();
  });
  window.addEventListener("pagehide", saveSidebarState);
  let collapsed = false;
  try {
    collapsed =
      localStorage.getItem("smartSuperAdmin.sidebarCollapsed") === "1";
  } catch {}
  function setCollapsed(value) {
    collapsed = value;
    document.documentElement.classList.toggle("smart-sidebar-collapsed", value);
    collapse?.setAttribute("aria-expanded", String(!value));
    const label = value
      ? collapse?.dataset.expandLabel
      : collapse?.dataset.collapseLabel;
    if (collapse && label) {
      collapse.setAttribute("aria-label", label);
      collapse.title = label;
    }
    const icon = collapse?.querySelector("i");
    if (icon) icon.className = value ? "bi bi-grid" : "bi bi-list";
    try {
      localStorage.setItem(
        "smartSuperAdmin.sidebarCollapsed",
        value ? "1" : "0",
      );
    } catch {}
  }
  setCollapsed(collapsed);
  collapse?.addEventListener("click", () => setCollapsed(!collapsed));
  function setSidebar(open) {
    if (!sidebar) return;
    sidebar.classList.toggle("open", open);
    if (backdrop) backdrop.hidden = !open;
    document.documentElement.classList.toggle("smart-drawer-open", open);
    toggle?.setAttribute("aria-expanded", String(open));
    const workspace = document.querySelector(".smart-workspace");
    if (workspace) workspace.inert = open;
    (open ? close : toggle)?.focus();
  }
  toggle?.addEventListener("click", () => setSidebar(true));
  close?.addEventListener("click", () => setSidebar(false));
  backdrop?.addEventListener("click", () => setSidebar(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (sidebar?.classList.contains("open")) setSidebar(false);
      sidebar?.querySelectorAll("details[open]").forEach((detail) => {
        if (detail.classList.contains("sidebar-profile")) detail.open = false;
      });
    }
    if (event.key === "Tab" && sidebar?.classList.contains("open")) {
      const nodes = [
        ...sidebar.querySelectorAll("a[href],button,summary,select"),
      ].filter((node) => node.getClientRects().length);
      if (event.shiftKey && document.activeElement === nodes[0]) {
        event.preventDefault();
        nodes.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
        event.preventDefault();
        nodes[0].focus();
      }
    }
  });
  desktop.addEventListener("change", (event) => {
    if (event.matches) {
      sidebar?.classList.remove("open");
      if (backdrop) backdrop.hidden = true;
      document.documentElement.classList.remove("smart-drawer-open");
      if (document.querySelector(".smart-workspace"))
        document.querySelector(".smart-workspace").inert = false;
      toggle?.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("click", (event) => {
    const profile = sidebar?.querySelector(".sidebar-profile");
    if (profile?.open && !profile.contains(event.target)) profile.open = false;
  });
  const fullscreen = document.querySelector("[data-fullscreen]");
  if (fullscreen && !document.fullscreenEnabled) fullscreen.hidden = true;
  fullscreen?.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      const status = document.querySelector("[data-shell-status]");
      if (status)
        status.textContent = "Fullscreen is unavailable in this browser.";
    }
  });
  document.addEventListener("fullscreenchange", () => {
    fullscreen?.setAttribute(
      "aria-pressed",
      String(Boolean(document.fullscreenElement)),
    );
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
  function closeRowMenus(except) {
    document.querySelectorAll(".row-action-menu[open]").forEach((menu) => {
      if (menu === except) return;
      menu.open = false;
      menu.querySelector(".row-action-menu-items")?.removeAttribute("style");
    });
  }
  function bindTableRows(root = document) {
    root.querySelectorAll("tr[data-row-url]").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.target.closest("a,button,summary,input,select,textarea,label")
        )
          return;
        window.location.href = row.dataset.rowUrl;
      });
      row.addEventListener("contextmenu", (event) => {
        const menu = row.querySelector(".row-action-menu"),
          items = menu?.querySelector(".row-action-menu-items");
        if (!menu || !items) return;
        event.preventDefault();
        closeRowMenus(menu);
        menu.open = true;
        const left = Math.max(
            8,
            Math.min(event.clientX, window.innerWidth - items.offsetWidth - 8),
          ),
          top = Math.max(
            8,
            Math.min(event.clientY, window.innerHeight - items.offsetHeight - 8),
          );
        items.style.position = "fixed";
        items.style.insetInlineEnd = "auto";
        items.style.insetBlockStart = "auto";
        items.style.left = left + "px";
        items.style.top = top + "px";
      });
    });
  }
  bindTableRows();
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".row-action-menu")) closeRowMenus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeRowMenus();
  });
  document.addEventListener("scroll", () => closeRowMenus(), true);
  window.addEventListener("resize", () => closeRowMenus());
  const returnTo = window.location.pathname + window.location.search;
  document
    .querySelectorAll('a[href^="/smart-super-admin/select-org/"]')
    .forEach((link) => {
      const url = new URL(link.href, window.location.origin);
      url.searchParams.set("returnTo", returnTo);
      link.href = url.pathname + url.search;
    });
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
          link.href =
            base +
            "/select-org/" +
            row.id +
            "?returnTo=" +
            encodeURIComponent(window.location.pathname + window.location.search);
          link.textContent = row.name + " (#" + row.id + ")";
          results.append(link);
        }
      } catch (error) {
        results.textContent = error.message;
      }
    }, 200);
  });
  document.querySelectorAll("[data-filter-form]").forEach((form) => {
    const search = form.querySelector("[data-filter-search]"),
      panel = form.querySelector("[data-filter-panel]"),
      toggle = form.querySelector("[data-filter-toggle]"),
      input = form.querySelector("[data-filter-input]"),
      clear = form.querySelector("[data-filter-clear]"),
      close = form.querySelector("[data-filter-close]"),
      reset = form.querySelector("[data-filter-reset]"),
      status = form.querySelector("[data-filter-status]");
    form.action = window.location.pathname.replace(/\/\d+\/?$/, "/1");
    let searchTimer, requestId = 0, activeRequest;
    function setPanel(open) {
      if (!panel || !toggle) return;
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.classList.toggle("is-active", open);
      search?.classList.toggle("is-open", open);
    }
    function syncClear() {
      if (clear && input) clear.hidden = !input.value;
    }
    async function loadResults() {
      window.clearTimeout(searchTimer);
      activeRequest?.abort();
      const controller = new AbortController(),
        currentRequest = ++requestId,
        params = new URLSearchParams(new FormData(form)),
        currentUrl = new URL(window.location.href);
      activeRequest = controller;
      if (currentUrl.searchParams.has("lang") && !params.has("lang"))
        params.set("lang", currentUrl.searchParams.get("lang"));
      const url = new URL(form.action, window.location.href);
      url.search = params.toString();
      search?.classList.add("is-loading");
      if (status) status.hidden = true;
      try {
        const response = await fetch(url, {
          headers: { "X-Requested-With": "XMLHttpRequest" },
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(`Could not refresh records (${response.status}).`);
        const html = await response.text();
        if (currentRequest !== requestId) return;
        const nextPage =
            new DOMParser().parseFromString(html, "text/html"),
          nextContent = nextPage.querySelector(".index-content"),
          nextFooter = nextPage.querySelector(".index-footer"),
          nextCount = nextPage.querySelector(".index-record-count"),
          content = document.querySelector(".index-content"),
          footer = document.querySelector(".index-footer"),
          count = document.querySelector(".index-record-count");
        if (!nextContent || !content || !nextFooter || !footer)
          throw new Error("The refreshed records could not be displayed.");
        content.replaceWith(nextContent);
        footer.replaceWith(nextFooter);
        if (nextCount && count) count.replaceWith(nextCount);
        bindTableRows(nextContent);
        window.history.replaceState(
          null,
          "",
          url.pathname + url.search + url.hash,
        );
      } catch (error) {
        if (error.name === "AbortError") return;
        console.error("Could not refresh Smart Super Admin records:", error);
        if (status) {
          status.textContent = form.dataset.errorMessage || error.message;
          status.hidden = false;
        }
      } finally {
        if (currentRequest === requestId) {
          activeRequest = null;
          search?.classList.remove("is-loading");
        }
      }
    }
    function scheduleSearch() {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(loadResults, 300);
    }
    syncClear();
    toggle?.addEventListener("click", (event) => {
      event.stopPropagation();
      setPanel(panel.hidden);
    });
    close?.addEventListener("click", () => {
      setPanel(false);
      toggle?.focus();
    });
    document.addEventListener("click", (event) => {
      if (!panel || panel.hidden || search?.contains(event.target)) return;
      setPanel(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && panel && !panel.hidden) setPanel(false);
    });
    input?.addEventListener("input", () => {
      syncClear();
      scheduleSearch();
    });
    clear?.addEventListener("click", () => {
      if (!input) return;
      input.value = "";
      syncClear();
      input.focus();
      scheduleSearch();
    });
    reset?.addEventListener("click", () => {
      if (input) input.value = "";
      panel
        ?.querySelectorAll("input")
        .forEach((field) => (field.value = ""));
      syncClear();
      setPanel(false);
      form.requestSubmit();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      setPanel(false);
      loadResults();
    });
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
