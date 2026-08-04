/**
 * The week of food behind `scripts/seed-demo-client.ts`.
 *
 * Split out from the script itself so the writing — seven days of Arabic meals,
 * their alternatives and the note under each one — stays readable as a menu, and
 * the script stays readable as a sequence of writes.
 *
 * Everything here is a dish SLUG, never a dish id: slugs are the catalog's stable
 * natural key (`dishes.slug`), so this menu survives a re-seed of the catalog and
 * fails loudly rather than silently planning the wrong food if one is renamed.
 *
 * No calorie figures appear here either. A portion is derived at write time from
 * the slot's own budget and the dish's real recipe (`bestServings`), which is the
 * same arithmetic the swap panel uses — writing "1.5 servings" by hand would be
 * inventing a number the ingredients have to agree with.
 */

/** One meal of the demo week. */
export type DemoMeal = {
  /** Matches a `slotKey` in the client's meal schedule. */
  slotKey: string;
  /** The dish the client is asked to eat. */
  dish: string;
  /** What they may eat instead, closest substitute first. Zero to three. */
  alternatives: string[];
  /** The dietitian's short note, shown under the meal in the portal. */
  noteAr: string;
};

export type DemoDay = {
  /** 0 = Sunday … 6 = Saturday, matching `weekly_plan_meals.day_of_week`. */
  dayOfWeek: number;
  meals: DemoMeal[];
};

/**
 * The note that identifies this plan as the demo's own.
 *
 * It is how re-running the script finds the plan it wrote last time instead of
 * building a second one — and why a plan for the same week that does NOT carry it
 * is left completely alone. See `seed-demo-client.ts`.
 */
export const DEMO_WEEK_NOTE =
  'خطة العرض التجريبي: أسبوع بيتي متوازن يدعم زيادة الوزن، مع بديلين لكل وجبة وبدون فول سوداني أو مكسّرات.';

/**
 * Seven days against the standard five-slot schedule.
 *
 * Written for this client's record: زيادة وزن, نشاط متوسط, وحساسية من الفول
 * السوداني — so nothing here carries the `nuts` allergen tag, and the loader
 * re-checks that against the filtered catalog rather than trusting this comment.
 */
export const DEMO_WEEK: DemoDay[] = [
  {
    dayOfWeek: 0,
    meals: [
      {
        slotKey: 'breakfast',
        dish: 'foul-mudammas',
        alternatives: ['hummus-tahini-breakfast', 'labaneh-zeit-pita'],
        noteAr: 'فول مدمس بزيت الزيتون: بروتين نباتي وألياف تفتح الأسبوع بطاقة تدوم حتى سناك الصباح.',
      },
      {
        slotKey: 'snack_1',
        dish: 'yogurt-cup',
        alternatives: ['strawberries-yogurt', 'guava-plain'],
        noteAr: 'كوب لبن بين الفطور والغداء يضيف بروتيناً خفيفاً دون أن يسدّ الشهية.',
      },
      {
        slotKey: 'lunch',
        dish: 'molokhia-chicken-rice',
        alternatives: ['grilled-chicken-rice-salad', 'bulgur-chicken'],
        noteAr: 'غداء بيتي متكامل: الدجاج للبروتين والأرز يحمل أكبر حصة طاقة في اليوم.',
      },
      {
        slotKey: 'snack_2',
        dish: 'figs-fresh',
        alternatives: ['pomegranate-bowl', 'pear-plain'],
        noteAr: 'تين طازج قبل العشاء يرفع السعرات بسكّريات طبيعية بدل الحلويات الجاهزة.',
      },
      {
        slotKey: 'dinner',
        dish: 'labaneh-cucumber-dinner',
        alternatives: ['hummus-plate-dinner', 'olives-cheese-plate'],
        noteAr: 'عشاء خفيف يريح المعدة قبل النوم، واللبنة تبقي حصة البروتين قائمة.',
      },
    ],
  },
  {
    dayOfWeek: 1,
    meals: [
      {
        slotKey: 'breakfast',
        dish: 'eggs-zaatar',
        alternatives: ['shakshuka', 'white-cheese-vegetables'],
        noteAr: 'بيض مع زعتر وزيت زيتون: بروتين ودهون صحية تكفي حتى الغداء.',
      },
      {
        slotKey: 'snack_1',
        dish: 'grapes-plain',
        alternatives: ['figs-fresh', 'orange-plain'],
        noteAr: 'عنب سريع ومحمول — سناك يناسب يوم عمل خارج البيت.',
      },
      {
        slotKey: 'lunch',
        dish: 'kofta-tahini-potato',
        alternatives: ['bamia-lahm', 'green-beans-lahm'],
        noteAr: 'الكفتة بالطحينة سعراتها عالية وتخدم هدف زيادة الوزن بوجبة واحدة.',
      },
      {
        slotKey: 'snack_2',
        dish: 'labaneh-cucumber-snack',
        alternatives: ['boiled-egg-snack', 'sunflower-seeds-cup'],
        noteAr: 'لبنة مع خيار: بروتين بارد وخفيف في وقت يميل فيه الجوع للحلو.',
      },
      {
        slotKey: 'dinner',
        dish: 'sardine-salad',
        alternatives: ['tuna-green-salad', 'grilled-fish-salad'],
        noteAr: 'سردين مع سلطة وخبز — عشاء رخيص وسريع وغني بأوميغا ٣.',
      },
    ],
  },
  {
    dayOfWeek: 2,
    meals: [
      {
        slotKey: 'breakfast',
        dish: 'oats-milk-banana',
        alternatives: ['oats-yogurt-dates', 'tahini-honey-pita'],
        noteAr: 'شوفان بالحليب والموز: نشويات معقّدة وسعرات تدعم زيادة الوزن من أول اليوم.',
      },
      {
        slotKey: 'snack_1',
        dish: 'strawberries-yogurt',
        alternatives: ['yogurt-cup', 'pear-plain'],
        noteAr: 'فراولة مع لبن — سناك حلو المذاق بسكّر طبيعي فقط.',
      },
      {
        slotKey: 'lunch',
        dish: 'shish-tawook-bulgur',
        alternatives: ['grilled-chicken-rice-salad', 'chicken-sweet-potato'],
        noteAr: 'شيش طاووق مع برغل: بروتين عالٍ ونشويات بطيئة الامتصاص.',
      },
      {
        slotKey: 'snack_2',
        dish: 'sunflower-seeds-cup',
        alternatives: ['figs-fresh', 'plums-apricots'],
        noteAr: 'بزر عبّاد الشمس بديل آمن عن الفول السوداني ويعطي دهوناً صحية.',
      },
      {
        slotKey: 'dinner',
        dish: 'chicken-cabbage-salad',
        alternatives: ['tuna-green-salad', 'omelette-vegetables'],
        noteAr: 'سلطة دجاج مع ملفوف: عشاء مشبع وخفيف على المعدة.',
      },
    ],
  },
  {
    dayOfWeek: 3,
    meals: [
      {
        slotKey: 'breakfast',
        dish: 'shakshuka',
        alternatives: ['eggs-spinach-scramble', 'foul-mudammas'],
        noteAr: 'شكشوكة بالبندورة والبيض — فطور دافئ يجمع البروتين والخضار في مقلاة واحدة.',
      },
      {
        slotKey: 'snack_1',
        dish: 'guava-plain',
        alternatives: ['orange-plain', 'grapes-plain'],
        noteAr: 'جوافة غنية بفيتامين ج، وتناسب من لا يحب الأكل الثقيل صباحاً.',
      },
      {
        slotKey: 'lunch',
        dish: 'mujaddara-salad',
        alternatives: ['fasolia-white-rice', 'kidney-bean-rice'],
        noteAr: 'مجدرة مع سلطة: عدس وأرز معاً يعطيان بروتيناً نباتياً متكاملاً بكلفة قليلة.',
      },
      {
        slotKey: 'snack_2',
        dish: 'boiled-egg-snack',
        alternatives: ['labaneh-cucumber-snack', 'yogurt-cup'],
        noteAr: 'بيضة مسلوقة تسدّ فجوة ما قبل العشاء ببروتين كامل.',
      },
      {
        slotKey: 'dinner',
        dish: 'hummus-plate-dinner',
        alternatives: ['moutabal-eggplant', 'baked-potato-cheese'],
        noteAr: 'طبق حمص بالطحينة مع خبز — عشاء مشبع يرفع سعرات اليوم بهدوء.',
      },
    ],
  },
  {
    dayOfWeek: 4,
    meals: [
      {
        slotKey: 'breakfast',
        dish: 'labaneh-zeit-pita',
        alternatives: ['white-cheese-vegetables', 'mozzarella-tomato-pita'],
        noteAr: 'لبنة بزيت الزيتون: فطور سريع لا يحتاج طبخاً في يوم مزدحم.',
      },
      {
        slotKey: 'snack_1',
        dish: 'pomegranate-bowl',
        alternatives: ['watermelon-plate', 'plums-apricots'],
        noteAr: 'رمّان — سناك موسمي غني بمضادات الأكسدة.',
      },
      {
        slotKey: 'lunch',
        dish: 'sayadieh-fish-rice',
        alternatives: ['salmon-couscous-vegetables', 'tuna-potato-salad'],
        noteAr: 'صيادية سمك مرة في الأسبوع تنوّع مصدر البروتين بعيداً عن اللحوم الحمراء.',
      },
      {
        slotKey: 'snack_2',
        dish: 'carrot-hummus-sticks',
        alternatives: ['cucumber-radish-plate', 'labaneh-cucumber-snack'],
        noteAr: 'جزر مع حمص: ألياف ودهون صحية تمنع الجوع الشديد قبل العشاء.',
      },
      {
        slotKey: 'dinner',
        dish: 'baked-potato-cheese',
        alternatives: ['moutabal-eggplant', 'fattoush'],
        noteAr: 'بطاطا بالفرن مع جبنة — عشاء دافئ يضيف نشويات وسعرات لهدف الزيادة.',
      },
    ],
  },
  {
    dayOfWeek: 5,
    meals: [
      {
        slotKey: 'breakfast',
        dish: 'manaqish-zaatar',
        alternatives: ['sfeeha-lahm', 'tahini-honey-pita'],
        noteAr: 'مناقيش زعتر يوم الجمعة — فطور من الفرن يبقى ضمن حصة الطاقة المحسوبة.',
      },
      {
        slotKey: 'snack_1',
        dish: 'watermelon-plate',
        alternatives: ['grapes-plain', 'figs-fresh'],
        noteAr: 'بطيخ يعوّض السوائل، خاصة في الأيام الحارة.',
      },
      {
        slotKey: 'lunch',
        dish: 'mahshi-kousa',
        alternatives: ['warak-enab', 'zucchini-yogurt-stew'],
        noteAr: 'محشي كوسا: غداء العائلة يوم الجمعة، بحصة محسوبة بدل الأكل على الإحساس.',
      },
      {
        slotKey: 'snack_2',
        dish: 'yogurt-cup',
        alternatives: ['strawberries-yogurt', 'pear-plain'],
        noteAr: 'لبن بعد غداء دسم يساعد على الهضم ويكمل البروتين.',
      },
      {
        slotKey: 'dinner',
        dish: 'grilled-fish-salad',
        alternatives: ['fattoush', 'tuna-green-salad'],
        noteAr: 'سمك مشوي مع سلطة — عشاء خفيف بعد غداء الجمعة.',
      },
    ],
  },
  {
    dayOfWeek: 6,
    meals: [
      {
        slotKey: 'breakfast',
        dish: 'hummus-tahini-breakfast',
        alternatives: ['foul-mudammas', 'olives-cheese-plate'],
        noteAr: 'حمص بالطحينة مع خبز: فطور نهاية الأسبوع، بروتين ودهون تكفي لصباح طويل.',
      },
      {
        slotKey: 'snack_1',
        dish: 'pear-plain',
        alternatives: ['guava-plain', 'orange-plain'],
        noteAr: 'إجاص — سناك محمول وسهل قبل الغداء.',
      },
      {
        slotKey: 'lunch',
        dish: 'chicken-sweet-potato',
        alternatives: ['bulgur-chicken', 'chickpea-spinach-stew'],
        noteAr: 'دجاج مع بطاطا حلوة: نشويات ذات مؤشر سكري معتدل مع بروتين عالٍ.',
      },
      {
        slotKey: 'snack_2',
        dish: 'plums-apricots',
        alternatives: ['cucumber-radish-plate', 'sunflower-seeds-cup'],
        noteAr: 'خوخ ومشمش يختمان اليوم بألياف وسكّر طبيعي.',
      },
      {
        slotKey: 'dinner',
        dish: 'mujaddara-salad',
        alternatives: ['lentil-soup-bulgur', 'chickpea-spinach-stew'],
        noteAr: 'مجدرة خفيفة مساءً تغلق الأسبوع بوجبة رخيصة ومشبعة.',
      },
    ],
  },
];
