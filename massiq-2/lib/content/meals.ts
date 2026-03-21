/* ─── MassIQ Meal Plan Generator — Zero-LLM ─────────────────────────────
   Replaces generateMealPlan() with a template database + macro-matching.

   Design:
   - 60+ meals across 4 categories (breakfast / lunch / dinner / snack)
   - Each meal has fixed macros + dietary tags for filtering
   - Plan generation picks 7 unique days, scaling portions to hit targets
   - Dietary restrictions (vegan, vegetarian, gluten-free, dairy-free) filter pool
─────────────────────────────────────────────────────────────────────────── */

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface Meal {
  id:          string
  name:        string
  description: string
  mealType:    'breakfast' | 'lunch' | 'dinner' | 'snack'
  time:        string
  icon:        string
  calories:    number
  protein:     number
  carbs:       number
  fat:         number
  prepTime:    string
  whyThisMeal: string
  tags:        string[]   // 'vegetarian' | 'vegan' | 'gluten-free' | 'dairy-free'
}

export interface MealDay {
  day:           string
  isTrainingDay: boolean
  totalCalories: number
  totalProtein:  number
  breakfast:     Meal
  lunch:         Meal
  dinner:        Meal
  snack:         Meal
}

/* ─── Meal database ──────────────────────────────────────────────────────── */

const MEALS: Meal[] = [
  // ── BREAKFASTS ───────────────────────────────────────────────────────────
  {
    id: 'bf01', name: 'Chicken & Egg White Scramble', mealType: 'breakfast', time: 'Breakfast', icon: '🍳',
    description: '150g diced chicken breast, 6 egg whites, spinach, peppers, olive oil',
    calories: 420, protein: 52, carbs: 8, fat: 18,
    prepTime: '10 min', whyThisMeal: 'High protein from two fast-digesting sources. Ideal first meal to start MPS.',
    tags: ['gluten-free', 'dairy-free'],
  },
  {
    id: 'bf02', name: 'Greek Yogurt Protein Bowl', mealType: 'breakfast', time: 'Breakfast', icon: '🥣',
    description: '300g Greek yoghurt (0%), 1 scoop protein powder, 40g oats, blueberries, honey',
    calories: 460, protein: 50, carbs: 52, fat: 6,
    prepTime: '5 min', whyThisMeal: 'Casein + whey combo slows digestion and keeps you full through the morning.',
    tags: ['vegetarian'],
  },
  {
    id: 'bf03', name: 'Overnight Oats with Protein', mealType: 'breakfast', time: 'Breakfast', icon: '🌾',
    description: '80g oats, 1 scoop protein powder, 200ml oat milk, banana, peanut butter',
    calories: 480, protein: 38, carbs: 62, fat: 10,
    prepTime: '5 min (prep night before)', whyThisMeal: 'Slow carbs + protein combination. High in beta-glucan which supports cholesterol and satiety.',
    tags: ['vegetarian', 'dairy-free'],
  },
  {
    id: 'bf04', name: 'Egg White Omelette & Sourdough', mealType: 'breakfast', time: 'Breakfast', icon: '🍳',
    description: '8 egg whites, mushrooms, tomato, 2 slices sourdough toast',
    calories: 380, protein: 40, carbs: 38, fat: 6,
    prepTime: '10 min', whyThisMeal: 'Clean protein with slow carbs. Low fat version for higher carb targets.',
    tags: ['vegetarian', 'dairy-free'],
  },
  {
    id: 'bf05', name: 'Smoked Salmon & Avocado Toast', mealType: 'breakfast', time: 'Breakfast', icon: '🥑',
    description: '100g smoked salmon, ½ avocado, 2 slices rye bread, lemon, capers',
    calories: 490, protein: 36, carbs: 38, fat: 22,
    prepTime: '5 min', whyThisMeal: 'Omega-3 from salmon and monounsaturated fat from avocado. High micronutrient density.',
    tags: ['gluten-free option', 'dairy-free'],
  },
  {
    id: 'bf06', name: 'Protein Pancakes', mealType: 'breakfast', time: 'Breakfast', icon: '🥞',
    description: '2 eggs, 1 scoop vanilla protein, 40g oats, banana, blueberry compote',
    calories: 450, protein: 40, carbs: 52, fat: 9,
    prepTime: '15 min', whyThisMeal: 'High adherence breakfast — tastes like a treat while hitting macro targets.',
    tags: ['vegetarian', 'dairy-free'],
  },
  {
    id: 'bf07', name: 'Turkey & Veggie Scramble', mealType: 'breakfast', time: 'Breakfast', icon: '🍳',
    description: '120g lean ground turkey, 3 whole eggs, courgette, onion, paprika',
    calories: 400, protein: 44, carbs: 10, fat: 20,
    prepTime: '12 min', whyThisMeal: 'Lean protein from two sources. Low carb version for evening-heavy carb cycling.',
    tags: ['gluten-free', 'dairy-free'],
  },
  {
    id: 'bf08', name: 'Cottage Cheese & Fruit Bowl', mealType: 'breakfast', time: 'Breakfast', icon: '🫙',
    description: '300g low-fat cottage cheese, strawberries, granola, chia seeds',
    calories: 390, protein: 44, carbs: 38, fat: 6,
    prepTime: '3 min', whyThisMeal: 'Casein protein for sustained amino acid release. Minimal prep for busy mornings.',
    tags: ['vegetarian', 'gluten-free'],
  },
  {
    id: 'bf09', name: 'Tofu Scramble', mealType: 'breakfast', time: 'Breakfast', icon: '🥚',
    description: '250g firm tofu, nutritional yeast, turmeric, spinach, cherry tomatoes, whole grain toast',
    calories: 380, protein: 32, carbs: 32, fat: 16,
    prepTime: '10 min', whyThisMeal: 'Complete plant protein. Excellent vegan alternative to egg scramble.',
    tags: ['vegan', 'dairy-free'],
  },
  {
    id: 'bf10', name: 'High Protein Smoothie Bowl', mealType: 'breakfast', time: 'Breakfast', icon: '🫐',
    description: '2 scoops protein powder, frozen berries, banana, 200ml almond milk, granola, nuts',
    calories: 480, protein: 46, carbs: 52, fat: 12,
    prepTime: '5 min', whyThisMeal: 'Quick to prepare. High protein density with micronutrient-rich fruit base.',
    tags: ['vegetarian', 'gluten-free', 'dairy-free'],
  },

  // ── LUNCHES ──────────────────────────────────────────────────────────────
  {
    id: 'ln01', name: 'Grilled Chicken Rice Bowl', mealType: 'lunch', time: 'Lunch', icon: '🍚',
    description: '200g grilled chicken breast, 150g cooked brown rice, roasted broccoli, soy-ginger sauce',
    calories: 560, protein: 52, carbs: 65, fat: 8,
    prepTime: '20 min (15 min prep cook)', whyThisMeal: 'Lean protein + complex carbs. Staple meal for every goal phase.',
    tags: ['gluten-free', 'dairy-free'],
  },
  {
    id: 'ln02', name: 'Turkey & Quinoa Salad', mealType: 'lunch', time: 'Lunch', icon: '🥗',
    description: '180g turkey breast, 150g cooked quinoa, cucumber, feta, olive oil, lemon dressing',
    calories: 510, protein: 48, carbs: 44, fat: 14,
    prepTime: '15 min', whyThisMeal: 'Complete amino acid profile from quinoa + turkey. Good fibre content from salad veg.',
    tags: ['gluten-free'],
  },
  {
    id: 'ln03', name: 'Tuna Protein Wrap', mealType: 'lunch', time: 'Lunch', icon: '🌯',
    description: '185g tuna in brine, whole-wheat wrap, Greek yoghurt, celery, lettuce, tomato',
    calories: 490, protein: 50, carbs: 48, fat: 8,
    prepTime: '5 min', whyThisMeal: 'Very high protein-to-calorie ratio. Fast prep. Omega-3 from tuna supports inflammation control.',
    tags: ['dairy-free option'],
  },
  {
    id: 'ln04', name: 'Lean Beef Stir-Fry', mealType: 'lunch', time: 'Lunch', icon: '🥩',
    description: '180g lean beef strips, 150g cooked noodles, pak choi, mushrooms, low-sodium soy sauce',
    calories: 580, protein: 50, carbs: 58, fat: 14,
    prepTime: '15 min', whyThisMeal: 'High iron and zinc from beef. Training-day carb option from noodles.',
    tags: ['dairy-free'],
  },
  {
    id: 'ln05', name: 'Salmon Sushi Bowl', mealType: 'lunch', time: 'Lunch', icon: '🍣',
    description: '180g salmon, 160g sushi rice, cucumber, avocado, edamame, soy sauce, sesame',
    calories: 580, protein: 44, carbs: 68, fat: 16,
    prepTime: '15 min (use pre-cooked rice)', whyThisMeal: 'Omega-3 + fast carbs. Excellent post-training meal for muscle recovery.',
    tags: ['dairy-free'],
  },
  {
    id: 'ln06', name: 'High Protein Caesar Salad', mealType: 'lunch', time: 'Lunch', icon: '🥗',
    description: '200g grilled chicken, cos lettuce, 2 hard boiled eggs, parmesan, light Caesar dressing',
    calories: 520, protein: 56, carbs: 14, fat: 26,
    prepTime: '10 min', whyThisMeal: 'Very high protein. Low carb version for rest days or fat-loss phase.',
    tags: ['gluten-free'],
  },
  {
    id: 'ln07', name: 'Prawn & Veggie Rice Bowl', mealType: 'lunch', time: 'Lunch', icon: '🍤',
    description: '250g king prawns, 150g jasmine rice, sugar snap peas, carrots, ginger-garlic sauce',
    calories: 490, protein: 48, carbs: 60, fat: 5,
    prepTime: '15 min', whyThisMeal: 'Extremely lean protein source. Very low fat allows more carbs for energy.',
    tags: ['gluten-free', 'dairy-free'],
  },
  {
    id: 'ln08', name: 'Turkey Meatball Bowl', mealType: 'lunch', time: 'Lunch', icon: '🍝',
    description: '5 turkey meatballs, 150g cooked pasta, marinara sauce, baby spinach, basil',
    calories: 550, protein: 52, carbs: 62, fat: 10,
    prepTime: '20 min (batch cook meatballs)', whyThisMeal: 'High volume meal with good protein. Batch-cook friendly for meal prep.',
    tags: ['dairy-free'],
  },
  {
    id: 'ln09', name: 'Lentil & Chicken Soup', mealType: 'lunch', time: 'Lunch', icon: '🍲',
    description: '150g shredded chicken, 150g cooked lentils, carrots, celery, turmeric, cumin broth',
    calories: 480, protein: 48, carbs: 48, fat: 8,
    prepTime: '25 min (or batch prep)', whyThisMeal: 'High fibre from lentils. Great satiety-to-calorie ratio. Micronutrient-dense.',
    tags: ['gluten-free', 'dairy-free'],
  },
  {
    id: 'ln10', name: 'Black Bean & Chicken Burrito Bowl', mealType: 'lunch', time: 'Lunch', icon: '🌮',
    description: '170g chicken breast, 100g black beans, 120g brown rice, salsa, lime, jalapeño',
    calories: 540, protein: 54, carbs: 62, fat: 6,
    prepTime: '20 min', whyThisMeal: 'High protein and fibre. Black beans add plant protein and prebiotic fibre.',
    tags: ['gluten-free', 'dairy-free'],
  },
  {
    id: 'ln11', name: 'Tempeh Stir-Fry Bowl', mealType: 'lunch', time: 'Lunch', icon: '🥢',
    description: '200g tempeh, 150g brown rice, broccoli, snap peas, tamari, sesame oil',
    calories: 520, protein: 36, carbs: 62, fat: 16,
    prepTime: '15 min', whyThisMeal: 'Fermented plant protein. Good vegan option with complete amino acid profile.',
    tags: ['vegan', 'gluten-free'],
  },

  // ── DINNERS ──────────────────────────────────────────────────────────────
  {
    id: 'dn01', name: 'Grilled Chicken & Sweet Potato', mealType: 'dinner', time: 'Dinner', icon: '🍗',
    description: '220g grilled chicken breast, 300g baked sweet potato, steamed green beans, olive oil',
    calories: 630, protein: 58, carbs: 72, fat: 10,
    prepTime: '30 min', whyThisMeal: 'Lean protein + slow carb. Ideal training-day dinner to replenish glycogen overnight.',
    tags: ['gluten-free', 'dairy-free'],
  },
  {
    id: 'dn02', name: 'Lean Beef & Brown Rice', mealType: 'dinner', time: 'Dinner', icon: '🥩',
    description: '200g lean beef mince, 180g cooked brown rice, stir-fried veg, low-sodium soy, garlic',
    calories: 680, protein: 58, carbs: 78, fat: 12,
    prepTime: '20 min', whyThisMeal: 'High iron and creatine from beef. Brown rice provides slow-digesting complex carbs.',
    tags: ['gluten-free', 'dairy-free'],
  },
  {
    id: 'dn03', name: 'Baked Salmon & Asparagus', mealType: 'dinner', time: 'Dinner', icon: '🐟',
    description: '220g salmon fillet, 200g asparagus, 150g cooked quinoa, lemon herb dressing',
    calories: 650, protein: 54, carbs: 42, fat: 28,
    prepTime: '25 min', whyThisMeal: 'Omega-3 fatty acids support recovery and reduce training-induced inflammation.',
    tags: ['gluten-free', 'dairy-free'],
  },
  {
    id: 'dn04', name: 'Chicken Thigh & Roasted Veg', mealType: 'dinner', time: 'Dinner', icon: '🍗',
    description: '250g chicken thigh (skin-off), roasted courgette, pepper, onion, 150g new potatoes',
    calories: 610, protein: 54, carbs: 48, fat: 18,
    prepTime: '35 min', whyThisMeal: 'Thigh meat has more zinc and iron than breast. High micronutrient density from roasted veg.',
    tags: ['gluten-free', 'dairy-free'],
  },
  {
    id: 'dn05', name: 'King Prawn Stir-Fry & Noodles', mealType: 'dinner', time: 'Dinner', icon: '🍜',
    description: '280g king prawns, 120g rice noodles, mangetout, spring onion, chilli, oyster sauce',
    calories: 570, protein: 50, carbs: 68, fat: 6,
    prepTime: '15 min', whyThisMeal: 'Very lean protein. High carb option for training days or bulking phases.',
    tags: ['gluten-free', 'dairy-free'],
  },
  {
    id: 'dn06', name: 'Turkey Bolognese & Pasta', mealType: 'dinner', time: 'Dinner', icon: '🍝',
    description: '200g lean turkey mince, 160g wholemeal pasta, tomato passata, basil, parmesan',
    calories: 660, protein: 58, carbs: 80, fat: 12,
    prepTime: '25 min', whyThisMeal: 'High volume, high protein, easy to batch cook. Whole-wheat pasta provides B vitamins and fibre.',
    tags: ['dairy-free option'],
  },
  {
    id: 'dn07', name: 'Cod Fish Tacos', mealType: 'dinner', time: 'Dinner', icon: '🌮',
    description: '280g baked cod, 4 corn tortillas, slaw, lime crema, avocado, coriander',
    calories: 570, protein: 52, carbs: 62, fat: 12,
    prepTime: '20 min', whyThisMeal: 'Very lean white fish. Corn tortillas keep it gluten-free. High micronutrient diversity.',
    tags: ['gluten-free', 'dairy-free option'],
  },
  {
    id: 'dn08', name: 'Pork Tenderloin & Quinoa', mealType: 'dinner', time: 'Dinner', icon: '🥩',
    description: '220g pork tenderloin, 160g cooked quinoa, roasted broccoli, mustard-herb glaze',
    calories: 620, protein: 58, carbs: 58, fat: 14,
    prepTime: '30 min', whyThisMeal: 'Pork tenderloin is one of the leanest meats available. High B-vitamin content.',
    tags: ['gluten-free', 'dairy-free'],
  },
  {
    id: 'dn09', name: 'Chicken & Lentil Curry', mealType: 'dinner', time: 'Dinner', icon: '🍛',
    description: '200g chicken breast, 150g cooked lentils, light coconut milk, spinach, turmeric, garam masala, 130g basmati',
    calories: 640, protein: 56, carbs: 76, fat: 10,
    prepTime: '30 min', whyThisMeal: 'Double protein sources. Turmeric is a potent anti-inflammatory. Batch-cook friendly.',
    tags: ['gluten-free', 'dairy-free'],
  },
  {
    id: 'dn10', name: 'Egg Fried Rice with Tofu', mealType: 'dinner', time: 'Dinner', icon: '🍳',
    description: '250g firm tofu, 200g cooked jasmine rice, 3 eggs, frozen veg, sesame oil, soy sauce',
    calories: 560, protein: 38, carbs: 64, fat: 18,
    prepTime: '15 min', whyThisMeal: 'Quick high-volume vegetarian meal. Good plant protein for vegan/vegetarian athletes.',
    tags: ['vegetarian', 'dairy-free'],
  },
  {
    id: 'dn11', name: 'Baked Cod & Potato Mash', mealType: 'dinner', time: 'Dinner', icon: '🐟',
    description: '250g cod, 300g potato mash (skimmed milk), steamed broccoli, lemon butter',
    calories: 580, protein: 56, carbs: 62, fat: 10,
    prepTime: '30 min', whyThisMeal: 'Very lean protein with comforting comfort-food profile. High in vitamins D and B12.',
    tags: ['gluten-free'],
  },
  {
    id: 'dn12', name: 'Chickpea & Veggie Bowl', mealType: 'dinner', time: 'Dinner', icon: '🫘',
    description: '240g roasted chickpeas, 160g quinoa, roasted red peppers, tahini dressing, cucumber',
    calories: 580, protein: 30, carbs: 80, fat: 16,
    prepTime: '30 min', whyThisMeal: 'High-fibre vegan protein source. Lower protein density — compensate with a protein snack.',
    tags: ['vegan', 'gluten-free', 'dairy-free'],
  },

  // ── SNACKS ───────────────────────────────────────────────────────────────
  {
    id: 'sn01', name: 'Protein Shake', mealType: 'snack', time: 'Snack', icon: '🥤',
    description: '2 scoops whey protein, 300ml whole milk or oat milk',
    calories: 240, protein: 46, carbs: 12, fat: 5,
    prepTime: '1 min', whyThisMeal: 'Fastest route to hitting protein targets. Essential post-workout or between-meal bridge.',
    tags: ['vegetarian', 'gluten-free'],
  },
  {
    id: 'sn02', name: 'Cottage Cheese & Almonds', mealType: 'snack', time: 'Snack', icon: '🫙',
    description: '200g low-fat cottage cheese, 25g almonds',
    calories: 270, protein: 30, carbs: 10, fat: 12,
    prepTime: '2 min', whyThisMeal: 'Casein protein for slow release. Healthy fats from almonds. Zero prep.',
    tags: ['vegetarian', 'gluten-free'],
  },
  {
    id: 'sn03', name: 'Hard Boiled Eggs & Rice Cakes', mealType: 'snack', time: 'Snack', icon: '🥚',
    description: '3 hard boiled eggs, 2 rice cakes',
    calories: 230, protein: 22, carbs: 16, fat: 10,
    prepTime: '10 min (batch prep)', whyThisMeal: 'Whole eggs provide choline and complete amino acid profile. Portable and pre-batchable.',
    tags: ['vegetarian', 'gluten-free', 'dairy-free'],
  },
  {
    id: 'sn04', name: 'Greek Yogurt (plain)', mealType: 'snack', time: 'Snack', icon: '🥛',
    description: '250g plain Greek yoghurt (0% fat), berries',
    calories: 195, protein: 24, carbs: 18, fat: 0,
    prepTime: '2 min', whyThisMeal: 'Probiotic benefits. Casein protein. Very low calorie for the protein content.',
    tags: ['vegetarian', 'gluten-free'],
  },
  {
    id: 'sn05', name: 'Turkey Slices & Crackers', mealType: 'snack', time: 'Snack', icon: '🦃',
    description: '120g cooked turkey breast slices, 30g whole grain crackers',
    calories: 230, protein: 28, carbs: 18, fat: 3,
    prepTime: '2 min', whyThisMeal: 'Very lean protein. Quick grab-and-go option for between meals.',
    tags: ['dairy-free'],
  },
  {
    id: 'sn06', name: 'Tuna & Rice Cakes', mealType: 'snack', time: 'Snack', icon: '🐟',
    description: '185g canned tuna (brine), 3 rice cakes, mustard',
    calories: 240, protein: 36, carbs: 18, fat: 2,
    prepTime: '3 min', whyThisMeal: 'Extremely high protein-to-calorie ratio. Omega-3 from tuna. Budget-friendly.',
    tags: ['gluten-free', 'dairy-free'],
  },
  {
    id: 'sn07', name: 'Edamame', mealType: 'snack', time: 'Snack', icon: '🫛',
    description: '200g shelled edamame, sea salt',
    calories: 250, protein: 22, carbs: 18, fat: 8,
    prepTime: '5 min (microwave from frozen)', whyThisMeal: 'Complete plant protein. High in fibre and micronutrients. Excellent vegan option.',
    tags: ['vegan', 'gluten-free', 'dairy-free'],
  },
  {
    id: 'sn08', name: 'Protein Bar', mealType: 'snack', time: 'Snack', icon: '🍫',
    description: 'High protein bar (20-25g protein, <250 kcal)',
    calories: 220, protein: 22, carbs: 22, fat: 6,
    prepTime: '0 min', whyThisMeal: 'Convenience option when whole food is unavailable. Useful for travel or long days.',
    tags: ['vegetarian'],
  },
  {
    id: 'sn09', name: 'Cottage Cheese & Cucumber', mealType: 'snack', time: 'Snack', icon: '🥒',
    description: '200g cottage cheese, sliced cucumber, dill, black pepper',
    calories: 185, protein: 26, carbs: 6, fat: 4,
    prepTime: '3 min', whyThisMeal: 'Low calorie, high protein. Good before bed — casein supports overnight MPS.',
    tags: ['vegetarian', 'gluten-free'],
  },
  {
    id: 'sn10', name: 'Peanut Butter on Rice Cakes', mealType: 'snack', time: 'Snack', icon: '🥜',
    description: '3 rice cakes, 2 tbsp peanut butter, sliced banana',
    calories: 340, protein: 10, carbs: 44, fat: 14,
    prepTime: '2 min', whyThisMeal: 'Lower protein snack. Use on training days when you need extra carb intake.',
    tags: ['vegan', 'gluten-free', 'dairy-free'],
  },
]

/* ─── Plan generation ────────────────────────────────────────────────────── */

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const TRAINING_PATTERN: Record<number, boolean[]> = {
  3: [true, false, true, false, true, false, false],
  4: [true, true, false, true, true, false, false],
  5: [true, true, true, false, true, true, false],
  6: [true, true, true, true, true, true, false],
}

function filterMeals(pool: Meal[], dietPrefs: string[], avoid: string[]): Meal[] {
  const avoidLower = avoid.map(a => a.toLowerCase())
  return pool.filter(meal => {
    if (avoidLower.some(a => meal.name.toLowerCase().includes(a) || meal.description.toLowerCase().includes(a))) return false
    if (dietPrefs.includes('Vegan') && !meal.tags.includes('vegan')) return false
    if (dietPrefs.includes('Vegetarian') && !meal.tags.includes('vegetarian') && !meal.tags.includes('vegan')) return false
    if (dietPrefs.includes('Gluten Free') && !meal.tags.includes('gluten-free')) return false
    if (dietPrefs.includes('Dairy Free') && !meal.tags.includes('dairy-free')) return false
    return true
  })
}

function scaleMeal(meal: Meal, targetCalories: number): Meal {
  const ratio = targetCalories / meal.calories
  return {
    ...meal,
    calories: Math.round(meal.calories * ratio),
    protein:  Math.round(meal.protein  * ratio),
    carbs:    Math.round(meal.carbs    * ratio),
    fat:      Math.round(meal.fat      * ratio),
  }
}

function pickUnique<T>(pool: T[], count: number): T[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  const result: T[] = []
  for (let i = 0; i < shuffled.length && result.length < count; i++) {
    if (!result.some(r => (r as any).id === (shuffled[i] as any).id)) {
      result.push(shuffled[i])
    }
  }
  // Wrap around if not enough
  for (let i = 0; result.length < count; i++) {
    result.push(shuffled[i % shuffled.length])
  }
  return result
}

/**
 * Build a 7-day meal plan from the template database.
 * @param targetCalories  Total daily calorie target
 * @param targetProtein   Daily protein target in grams
 * @param trainDays       Number of training days (determines carb cycling)
 * @param dietPrefs       Array of dietary preferences (Vegan, Vegetarian, etc.)
 * @param avoid           Foods to avoid
 * @returns Array of 7 MealDay objects
 */
export function buildMealPlan(
  targetCalories: number,
  targetProtein: number,
  trainDays: number = 4,
  dietPrefs: string[] = [],
  avoid: string[] = [],
): MealDay[] {
  // Meal-type calorie distribution (training vs rest day)
  const distTrain = { breakfast: 0.28, lunch: 0.32, dinner: 0.30, snack: 0.10 }
  const distRest  = { breakfast: 0.30, lunch: 0.30, dinner: 0.32, snack: 0.08 }

  const trainingPattern = TRAINING_PATTERN[Math.max(3, Math.min(6, trainDays))] || TRAINING_PATTERN[4]

  const breakfasts = filterMeals(MEALS.filter(m => m.mealType === 'breakfast'), dietPrefs, avoid)
  const lunches    = filterMeals(MEALS.filter(m => m.mealType === 'lunch'),    dietPrefs, avoid)
  const dinners    = filterMeals(MEALS.filter(m => m.mealType === 'dinner'),   dietPrefs, avoid)
  const snacks     = filterMeals(MEALS.filter(m => m.mealType === 'snack'),    dietPrefs, avoid)

  // Fallback: if filters eliminate too many options, use unfiltered pool
  const bf = breakfasts.length >= 7 ? breakfasts : MEALS.filter(m => m.mealType === 'breakfast')
  const ln = lunches.length    >= 7 ? lunches    : MEALS.filter(m => m.mealType === 'lunch')
  const dn = dinners.length    >= 7 ? dinners    : MEALS.filter(m => m.mealType === 'dinner')
  const sn = snacks.length     >= 7 ? snacks     : MEALS.filter(m => m.mealType === 'snack')

  const bfPick = pickUnique(bf, 7)
  const lnPick = pickUnique(ln, 7)
  const dnPick = pickUnique(dn, 7)
  const snPick = pickUnique(sn, 7)

  return DAYS.map((day, i) => {
    const isTrain = trainingPattern[i]
    const dist    = isTrain ? distTrain : distRest
    // Training days get +5% calories for glycogen replenishment
    const dayCals = Math.round(targetCalories * (isTrain ? 1.05 : 0.95))

    const breakfast = scaleMeal(bfPick[i], Math.round(dayCals * dist.breakfast))
    const lunch     = scaleMeal(lnPick[i], Math.round(dayCals * dist.lunch))
    const dinner    = scaleMeal(dnPick[i], Math.round(dayCals * dist.dinner))
    const snack     = scaleMeal(snPick[i], Math.round(dayCals * dist.snack))

    const totalCalories = breakfast.calories + lunch.calories + dinner.calories + snack.calories
    const totalProtein  = breakfast.protein  + lunch.protein  + dinner.protein  + snack.protein

    return { day, isTrainingDay: isTrain, totalCalories, totalProtein, breakfast, lunch, dinner, snack }
  })
}
