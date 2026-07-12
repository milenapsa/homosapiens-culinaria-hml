const ALLOWED_UNITS = new Set(["g", "kg", "ml", "l", "un"]);
const ALLOWED_DIETS = new Set(["vegano", "vegetariano", "sem_gluten"]);
const KNOWN_ALLERGENS = new Set([
  "leite", "lactose", "ovo", "gluten", "trigo", "amendoim", "soja",
  "castanha", "nozes", "peixe", "crustaceo", "camarao", "trigo"
]);
const ANIMAL_INGREDIENTS = [
  "carne", "frango", "peixe", "ovo", "leite", "queijo", "manteiga",
  "iogurte", "mel", "presunto", "bacon"
];
const GLUTEN_INGREDIENTS = ["trigo", "cevada", "centeio", "malte"];
const ALLERGEN_DISCLOSURE_RULES = [
  {
    label: "leite",
    declared: ["leite", "lactose"],
    ingredients: ["leite", "queijo", "manteiga", "iogurte", "creme de leite"]
  },
  {
    label: "ovo",
    declared: ["ovo"],
    ingredients: ["ovo", "ovos"]
  },
  {
    label: "amendoim",
    declared: ["amendoim"],
    ingredients: ["amendoim"]
  },
  {
    label: "soja",
    declared: ["soja"],
    ingredients: ["soja"]
  }
];
const UNSAFE_PHRASES = [
  "burlar trava", "remover trava", "desativar trava", "ligacao direta",
  "fio desencapado", "improvisar gas", "abrir sob pressao", "forcar a tampa"
];

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function containsWord(text, term) {
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(normalize(text));
}

export function validateCatalog(equipment, recipes) {
  const errors = [];
  const warnings = [];
  const equipmentIds = [
    ...equipment.appliances.map(([id]) => id),
    ...equipment.utensils.map(([id]) => id)
  ];
  const equipmentSet = new Set(equipmentIds);

  if (equipmentSet.size !== equipmentIds.length) {
    errors.push("Há IDs de equipamentos duplicados.");
  }

  const recipeIds = recipes.map((recipe) => recipe.id);
  if (new Set(recipeIds).size !== recipeIds.length) {
    errors.push("Há IDs de receitas duplicados.");
  }

  for (const recipe of recipes) {
    if (!recipe.id || !recipe.title) errors.push("Receita sem id ou título.");
    if (!Number.isFinite(recipe.minutes) || recipe.minutes <= 0) {
      errors.push(`${recipe.id}: tempo inválido.`);
    }
    if (!Number.isFinite(recipe.baseServings) || recipe.baseServings <= 0) {
      errors.push(`${recipe.id}: porções-base inválidas.`);
    }
    if (!Array.isArray(recipe.diets) || !recipe.diets.every((diet) => ALLOWED_DIETS.has(diet))) {
      errors.push(`${recipe.id}: dieta desconhecida.`);
    }
    if (!Array.isArray(recipe.allergens)) {
      errors.push(`${recipe.id}: alergênicos devem ser uma lista.`);
    } else {
      for (const allergen of recipe.allergens) {
        if (!normalize(allergen)) errors.push(`${recipe.id}: alergênico vazio.`);
        if (!KNOWN_ALLERGENS.has(normalize(allergen))) {
          warnings.push(`${recipe.id}: alergênico não catalogado "${allergen}".`);
        }
      }
    }

    if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.length) {
      errors.push(`${recipe.id}: sem ingredientes.`);
    }
    for (const ingredient of recipe.ingredients ?? []) {
      if (
        !ingredient.name ||
        !Number.isFinite(ingredient.qty) ||
        ingredient.qty <= 0 ||
        !ALLOWED_UNITS.has(ingredient.unit)
      ) {
        errors.push(`${recipe.id}: ingrediente inválido.`);
      }
    }

    const ingredientText = (recipe.ingredients ?? []).map((item) => item.name).join(" ");
    const declaredAllergens = new Set((recipe.allergens ?? []).map(normalize));
    for (const rule of ALLERGEN_DISCLOSURE_RULES) {
      const present = rule.ingredients.some((item) => containsWord(ingredientText, item));
      const declared = rule.declared.some((item) => declaredAllergens.has(item));
      if (present && !declared) {
        errors.push(`${recipe.id}: ingrediente indica alergênico ${rule.label}, mas a declaração está ausente.`);
      }
    }
    if (
      recipe.diets?.includes("vegano") &&
      ANIMAL_INGREDIENTS.some((item) => containsWord(ingredientText, item))
    ) {
      errors.push(`${recipe.id}: rótulo vegano conflita com ingrediente de origem animal.`);
    }
    if (
      recipe.diets?.includes("sem_gluten") &&
      GLUTEN_INGREDIENTS.some((item) => containsWord(ingredientText, item))
    ) {
      errors.push(`${recipe.id}: rótulo sem glúten conflita com ingrediente com glúten.`);
    }

    if (!Array.isArray(recipe.methods) || !recipe.methods.length) {
      errors.push(`${recipe.id}: sem método.`);
    }
    const methodIds = (recipe.methods ?? []).map((method) => method.id);
    if (new Set(methodIds).size !== methodIds.length) {
      errors.push(`${recipe.id}: IDs de métodos duplicados.`);
    }

    for (const method of recipe.methods ?? []) {
      if (
        !method.id ||
        !method.label ||
        !Array.isArray(method.requires) ||
        !Array.isArray(method.steps) ||
        !method.steps.length
      ) {
        errors.push(`${recipe.id}: método inválido.`);
      }
      for (const requirement of method.requires ?? []) {
        if (!equipmentSet.has(requirement)) {
          errors.push(`${recipe.id}: requisito desconhecido ${requirement}.`);
        }
      }
      for (const step of method.steps ?? []) {
        if (typeof step !== "string" || !step.trim() || step.length > 500) {
          errors.push(`${recipe.id}: passo inválido.`);
          continue;
        }
        const normalized = normalize(step);
        if (UNSAFE_PHRASES.some((phrase) => normalized.includes(phrase))) {
          errors.push(`${recipe.id}: instrução potencialmente insegura detectada.`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
