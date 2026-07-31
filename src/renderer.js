let state;
let selectedId;

const $ = (selector) => document.querySelector(selector);
const format = (number) => new Intl.NumberFormat("en", { notation: number > 999999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(number || 0);

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 1800);
}

function selectedProfile() {
  return state.profiles.find((profile) => profile.id === selectedId);
}

async function save() {
  state = await window.roleSwitch.saveState(state);
}

function renderNav() {
  $("#profiles").innerHTML = state.profiles.map((profile) => `
    <button class="profile-button ${profile.id === selectedId ? "selected" : ""} ${profile.id === state.activeProfileId ? "active" : ""}" data-profile="${profile.id}">
      <span class="profile-dot" style="background:${profile.color}"></span>
      <strong>${profile.name}</strong>
    </button>
  `).join("");
  document.querySelectorAll("[data-profile]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedId = button.dataset.profile;
      render();
    });
  });
}

function render() {
  const profile = selectedProfile();
  if (!profile) {
    document.documentElement.style.setProperty("--accent", "#80A8FF");
    $("#profile-title").textContent = "No profiles yet";
    $("#profile-subtitle").textContent = "Create a profile to bundle your agents, knowledge, and integrations.";
    $("#status-copy").textContent = "Create your first profile to get started";
    $(".status-dot").style.background = "#737C8E";
    $(".status-note").textContent = "";
    $("#activate").disabled = true;
    $("#activate").textContent = "No active context";
    document.querySelectorAll("[data-agent], .pick, [data-open], #add-integration, #refresh-usage")
      .forEach((button) => { button.disabled = true; });
    $("#codex-path").textContent = "";
    $("#claude-path").textContent = "";
    $("#vault-path").textContent = "Not configured";
    $("#project-path").textContent = "Not configured";
    $("#terminal-profile").textContent = "<profile>";
    $("#integrations").innerHTML = "";
    $("#usage-total").textContent = "—";
    $("#usage-input").textContent = "—";
    $("#usage-output").textContent = "—";
    $("#usage-cache").textContent = "—";
    $("#usage-note").textContent = "Usage appears after you create and use a profile.";
    for (const key of ["input", "output", "cache"]) $(`#${key}-meter`).style.width = "0%";
    renderNav();
    return;
  }
  document.querySelectorAll("[data-agent], .pick, #add-integration, #refresh-usage")
    .forEach((button) => { button.disabled = false; });
  const isActive = selectedId === state.activeProfileId;
  document.documentElement.style.setProperty("--accent", profile.color);
  $("#profile-title").textContent = profile.name;
  $("#profile-subtitle").textContent = "Your agents, knowledge, and integrations move together.";
  $("#status-copy").textContent = isActive ? `${profile.name} is active` : `${profile.name} is not active`;
  $(".status-dot").style.background = isActive ? "#67D3B0" : "#737C8E";
  $(".status-note").textContent = "New agent sessions use this context.";
  $("#activate").disabled = isActive;
  $("#activate").textContent = isActive ? "Active context" : `Activate ${profile.name}`;
  $("#codex-path").textContent = profile.codexHome;
  $("#claude-path").textContent = profile.claudeConfigDir;
  $("#vault-path").textContent = profile.vaultPath || "Not configured";
  $("#project-path").textContent = profile.projectPath || "Not configured";
  $("#terminal-profile").textContent = profile.id;
  document.querySelector('[data-open="vaultPath"]').disabled = !profile.vaultPath;
  document.querySelector('[data-open="projectPath"]').disabled = !profile.projectPath;
  $("#integrations").innerHTML = (profile.integrations || []).map((name, index) =>
    `<span class="chip">${name}<button data-remove-integration="${index}" aria-label="Remove ${name}">×</button></span>`
  ).join("");
  document.querySelectorAll("[data-remove-integration]").forEach((button) => {
    button.addEventListener("click", async () => {
      profile.integrations.splice(Number(button.dataset.removeIntegration), 1);
      await save();
      render();
    });
  });
  renderNav();
  refreshUsage();
}

async function refreshUsage() {
  const usage = await window.roleSwitch.getUsage(selectedId);
  const total = usage?.total || 0;
  $("#usage-total").textContent = format(total);
  $("#usage-input").textContent = format(usage?.input);
  $("#usage-output").textContent = format(usage?.output);
  $("#usage-cache").textContent = format(usage?.cache);
  $("#usage-note").textContent = usage?.files
    ? `Calculated from ${usage.files} local session log${usage.files === 1 ? "" : "s"}.`
    : "Usage appears after sessions are launched through this profile.";
  for (const key of ["input", "output", "cache"]) {
    $(`#${key}-meter`).style.width = `${total ? ((usage[key] || 0) / total) * 100 : 0}%`;
  }
}

async function init() {
  state = await window.roleSwitch.getState();
  selectedId = state.activeProfileId || state.profiles[0]?.id;
  render();

  $("#activate").addEventListener("click", async () => {
    state = await window.roleSwitch.activate(selectedId);
    render();
    toast(`${selectedProfile().name} activated`);
  });
  document.querySelectorAll("[data-agent]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (state.activeProfileId !== selectedId) {
        state = await window.roleSwitch.activate(selectedId);
      }
      await window.roleSwitch.launch(selectedId, button.dataset.agent);
      render();
      toast(`${button.dataset.agent === "codex" ? "Codex" : "Claude Code"} launched for ${selectedProfile().name}`);
    });
  });
  document.querySelectorAll(".pick").forEach((button) => {
    button.addEventListener("click", async () => {
      const folder = await window.roleSwitch.chooseFolder();
      if (!folder) return;
      selectedProfile()[button.dataset.field] = folder;
      await save();
      render();
    });
  });
  document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = selectedProfile()[button.dataset.open];
      if (target) window.roleSwitch.openFolder(target);
    });
  });
  $("#add-integration").addEventListener("click", async () => {
    const input = $("#integration-name");
    const name = input.value.trim();
    if (!name) return;
    selectedProfile().integrations ||= [];
    selectedProfile().integrations.push(name);
    input.value = "";
    await save();
    render();
  });
  $("#integration-name").addEventListener("keydown", (event) => {
    if (event.key === "Enter") $("#add-integration").click();
  });
  $("#refresh-usage").addEventListener("click", refreshUsage);

  let selectedColor = "#80A8FF";
  $("#new-profile").addEventListener("click", () => {
    $("#profile-name").value = "";
    $("#profile-dialog").showModal();
    setTimeout(() => $("#profile-name").focus(), 20);
  });
  document.querySelectorAll("[data-color]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedColor = button.dataset.color;
      document.querySelectorAll("[data-color]").forEach((item) => item.classList.toggle("selected", item === button));
    });
  });
  $("#profile-form").addEventListener("submit", async (event) => {
    const name = $("#profile-name").value.trim();
    if (!name) {
      event.preventDefault();
      $("#profile-name").focus();
      return;
    }
    event.preventDefault();
    const result = await window.roleSwitch.createProfile(name, selectedColor);
    state = result.state;
    selectedId = result.profile.id;
    $("#profile-dialog").close();
    render();
    toast(`${name} profile created`);
  });
  $("#install-terminal").addEventListener("click", async () => {
    const result = await window.roleSwitch.installTerminal();
    toast("Terminal commands installed");
    $("#install-terminal").textContent = "Installed — open a new terminal";
    $("#install-terminal").disabled = true;
    console.info("Rolebox terminal integration installed", result);
  });
}

init();
