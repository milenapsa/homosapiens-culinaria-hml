import { RECIPES } from "./catalog.js";
import {
  buildShoppingList,
  convertQuantity,
  recommendRecipes,
  safeState,
  summarizeMealPlan,
  upsertMealPlanEntry
} from "./domain.js";
import {
  clearState,
  createExportPayload,
  DEFAULT_STATE,
  extractImportCandidate,
  loadState,
  saveState,
  sanitizeState,
  STATE_OPTIONS
} from "./storage.js";
import {
  renderAllergenPresets,
  renderEquipment,
  renderHistory,
  renderPantry,
  renderPlan,
  renderRecommendations,
  shoppingText,
  syncPreferenceInputs,
  toast
} from "./ui.js";

const $ = (selector) => document.querySelector(selector);
let state = loadState();
let currentResults = [];
let recommendationsGenerated = false;

function currentShopping() {
  return buildShoppingList(
    state.mealPlan,
    RECIPES,
    state.pantry,
    state.preferences.servings
  );
}

function currentPlanSummary() {
  const shopping = currentShopping();
  return summarizeMealPlan(state.mealPlan, RECIPES, shopping);
}

function persistAndRender() {
  state = sanitizeState(state);
  const saved = saveState(state);
  render();
  if (!saved) toast("Não foi possível salvar no navegador.");
}

function render() {
  renderEquipment(state);
  renderAllergenPresets(state);
  renderPantry(state);
  renderPlan(state, RECIPES, currentShopping(), currentPlanSummary());
  renderHistory(state);
  syncPreferenceInputs(state);
  if (recommendationsGenerated) {
    currentResults = recommendRecipes(RECIPES, state, state.preferences);
    renderRecommendations(currentResults, state.preferences.servings);
  }
}

function selectedAllergens() {
  return [...document.querySelectorAll("[data-allergen]:checked")]
    .map((input) => input.value);
}

function updatePreferences() {
  state.preferences = {
    maxTime: $("#time-filter").value,
    diet: $("#diet-filter").value,
    servings: Math.min(12, Math.max(1, Number($("#servings-filter").value) || 2)),
    exclude: $("#exclude-filter").value,
    search: $("#search-filter").value,
    allergens: selectedAllergens(),
    sortBy: $("#sort-filter").value,
    onlyExecutable: $("#only-executable").checked,
    onlyComplete: $("#only-complete").checked,
    onlyFavorites: $("#only-favorites").checked
  };
  state = sanitizeState(state);
  saveState(state);
}

function generateRecommendations() {
  updatePreferences();
  recommendationsGenerated = true;
  currentResults = recommendRecipes(RECIPES, state, state.preferences);
  renderRecommendations(currentResults, state.preferences.servings);
  renderPlan(state, RECIPES, currentShopping(), currentPlanSummary());
}

document.addEventListener("change", (event) => {
  const type = event.target.dataset.equipment;
  if (type) {
    state[type] = [...document.querySelectorAll(`[data-equipment="${type}"]:checked`)]
      .map((input) => input.value);
    persistAndRender();
    return;
  }

  if (event.target.matches("[data-allergen]")) {
    updatePreferences();
    if (recommendationsGenerated) generateRecommendations();
    return;
  }

  const pantryQty = event.target.dataset.pantryQty;
  if (pantryQty !== undefined) {
    state.pantry[Number(pantryQty)].qty = Number(event.target.value);
    persistAndRender();
    return;
  }

  const pantryUnit = event.target.dataset.pantryUnit;
  if (pantryUnit !== undefined) {
    const index = Number(pantryUnit);
    const current = state.pantry[index];
    const converted = convertQuantity(current.qty, current.unit, event.target.value);
    state.pantry[index] = {
      ...current,
      qty: converted.qty,
      unit: converted.unit
    };
    persistAndRender();
    if (!converted.converted) {
      toast("Unidade alterada entre categorias diferentes. Confire a quantidade.");
    }
    return;
  }

  const planServings = event.target.dataset.planServings;
  if (planServings !== undefined) {
    state.mealPlan[Number(planServings)].servings = Number(event.target.value);
    persistAndRender();
  }
});

document.addEventListener("click", (event) => {
  const removePantry = event.target.dataset.removePantry;
  const removePlan = event.target.dataset.removePlan;
  const addPlan = event.target.dataset.addPlan;
  const prepared = event.target.dataset.prepared;
  const favorite = event.target.dataset.favorite;

  if (removePantry !== undefined) {
    state.pantry.splice(Number(removePantry), 1);
    persistAndRender();
    return;
  }

  if (removePlan !== undefined) {
    state.mealPlan.splice(Number(removePlan), 1);
    persistAndRender();
    return;
  }

  if (favorite) {
    const favorites = new Set(state.favorites);
    if (favorites.has(favorite)) {
      favorites.delete(favorite);
      toast("Receita removida dos favoritos.");
    } else {
      favorites.add(favorite);
      toast("Receita adicionada aos favoritos.");
    }
    state.favorites = [...favorites];
    persistAndRender();
    return;
  }

  if (addPlan) {
    const existed = state.mealPlan.some((entry) => entry.recipeId === addPlan);
    if (!existed && state.mealPlan.length >= 100) {
      toast("O cardápio atingiu o limite local de 100 itens.");
      return;
    }
    state.mealPlan = upsertMealPlanEntry(
      state.mealPlan,
      addPlan,
      state.preferences.servings
    );
    persistAndRender();
    toast(existed
      ? "Porções da receita atualizadas no cardápio."
      : "Receita adicionada ao cardápio com as porções atuais.");
    return;
  }

  if (prepared) {
    const recipe = RECIPES.find((item) => item.id === prepared);
    if (recipe) {
      state.history.push({
        recipeId: recipe.id,
        title: recipe.title,
        servings: state.preferences.servings,
        at: new Date().toISOString()
      });
      persistAndRender();
      toast("Histórico local atualizado.");
    }
  }
});

$("#pantry-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#ingredient").value.trim();
  const qty = Number($("#quantity").value);
  const unit = $("#unit").value;
  if (!name || !Number.isFinite(qty) || qty <= 0) {
    toast("Informe ingrediente e quantidade válida.");
    return;
  }
  if (state.pantry.length >= 200) {
    toast("A despensa atingiu o limite local de 200 itens.");
    return;
  }
  state.pantry.push({ name, qty, unit });
  event.target.reset();
  $("#quantity").value = 1;
  persistAndRender();
});

$("#recommend").addEventListener("click", generateRecommendations);

[
  "#time-filter",
  "#diet-filter",
  "#servings-filter",
  "#exclude-filter",
  "#search-filter",
  "#sort-filter",
  "#only-executable",
  "#only-complete",
  "#only-favorites"
].forEach((selector) => {
  $(selector).addEventListener("change", () => {
    updatePreferences();
    if (recommendationsGenerated) generateRecommendations();
  });
});

$("#copy-shopping").addEventListener("click", async () => {
  const text = shoppingText(currentShopping());
  if (!text) {
    toast("A lista está vazia.");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Lista copiada.");
  } catch {
    toast("Não foi possível acessar a área de transferência.");
  }
});

$("#clear-plan").addEventListener("click", () => {
  if (!state.mealPlan.length) return;
  if (!globalThis.confirm("Limpar todo o cardápio local?")) return;
  state.mealPlan = [];
  persistAndRender();
  toast("Cardápio local limpo.");
});

$("#clear-history").addEventListener("click", () => {
  if (!state.history.length) return;
  if (!globalThis.confirm("Limpar todo o histórico local?")) return;
  state.history = [];
  persistAndRender();
  toast("Histórico local limpo.");
});

$("#export-data").addEventListener("click", () => {
  state = sanitizeState(state);
  const payload = createExportPayload(state);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "chefsapiens-dados-v4.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

$("#import-data").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (file.size > 1_000_000) {
    toast("Arquivo muito grande. Limite: 1 MB.");
    return;
  }

  try {
    const parsed = JSON.parse(await file.text());
    const imported = safeState(
      extractImportCandidate(parsed),
      DEFAULT_STATE,
      STATE_OPTIONS
    );
    const confirmed = globalThis.confirm(
      "Substituir os dados locais atuais pelos dados válidos deste arquivo?"
    );
    if (!confirmed) return;
    state = imported;
    currentResults = [];
    recommendationsGenerated = false;
    persistAndRender();
    renderRecommendations([], state.preferences.servings);
    toast("Dados importados e migrados para o formato atual.");
  } catch {
    toast("Arquivo JSON inválido.");
  }
});

$("#clear-data").addEventListener("click", () => {
  const confirmed = globalThis.confirm("Apagar despensa, favoritos, cardápio, preferências e histórico deste navegador?");
  if (!confirmed) return;
  clearState();
  state = structuredClone(DEFAULT_STATE);
  currentResults = [];
  recommendationsGenerated = false;
  renderRecommendations([], state.preferences.servings);
  render();
  toast("Dados locais apagados.");
});


function resetFilters() {
  state.preferences = structuredClone(DEFAULT_STATE.preferences);
  state = sanitizeState(state);
  currentResults = [];
  recommendationsGenerated = false;
  saveState(state);
  renderRecommendations([], state.preferences.servings);
  render();
  toast("Filtros redefinidos.");
}

function registerOfflineSupport() {
  if (!("serviceWorker" in navigator)) return;
  if (!["http:", "https:"].includes(globalThis.location.protocol)) return;
  navigator.serviceWorker.register("./service-worker.js").catch(() => {
    // O aplicativo continua funcional sem cache offline.
  });
}

$("#clear-pantry").addEventListener("click", () => {
  if (!state.pantry.length) return;
  if (!globalThis.confirm("Limpar todos os itens da despensa local?")) return;
  state.pantry = [];
  persistAndRender();
  toast("Despensa local limpa.");
});

$("#reset-filters").addEventListener("click", resetFilters);

$("#print-shopping").addEventListener("click", () => {
  if (!currentShopping().length) {
    toast("A lista está vazia.");
    return;
  }
  globalThis.print();
});


render();
registerOfflineSupport();
