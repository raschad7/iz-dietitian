import {
  Apple,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowUpDown,
  ArrowUpRight,
  Beef,
  Bell,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarPlus,
  CalendarRange,
  CalendarSync,
  CalendarX,
  ChartLine,
  Check,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleCheck,
  CircleUser,
  ClipboardList,
  Clock,
  Coffee,
  Cookie,
  Copy,
  CupSoda,
  DoorClosed,
  DoorOpen,
  Droplet,
  Eraser,
  Eye,
  EyeOff,
  FileLock,
  FileText,
  Flame,
  Footprints,
  GripVertical,
  Heart,
  HelpCircle,
  History,
  House,
  Info,
  KeyRound,
  LayoutDashboard,
  Leaf,
  LifeBuoy,
  Lightbulb,
  ListFilter,
  Lock,
  LogOut,
  Mail,
  Map,
  MapPin,
  Mars,
  Menu,
  MessageCircle,
  MessageSquare,
  Minus,
  Moon,
  MoreVertical,
  NotebookPen,
  Pencil,
  Phone,
  Pill,
  Plus,
  RefreshCw,
  Repeat,
  Ruler,
  Sandwich,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Stethoscope,
  Sun,
  Sunrise,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Upload,
  User,
  UserPlus,
  Users,
  Utensils,
  UtensilsCrossed,
  Venus,
  Weight,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Every icon in the app, by the name the app calls it.
 *
 * **One set: lucide.** This registry used to hold Solar glyphs inlined as SVG
 * markup by `scripts/generate-icons.ts`; it is lucide's React components now,
 * which is the set `components.json` has always declared and the one the
 * calendar's own chevrons were already drawn from. Everything downstream is
 * unchanged: `Icon` still takes a `name`, the names are the same names, and a
 * misspelling is still a build error rather than a blank square.
 *
 * **Names describe the job, not the picture.** `addClient` rather than
 * `user-plus`, `driftUp` rather than `trending-up` — a screen asks for the icon
 * that means the thing it is doing, so re-pointing one at a different glyph is
 * an edit here rather than a sweep of a hundred call sites.
 *
 * Several names deliberately share a glyph. The `*Outline` entries are what is
 * left of a filled/linear split the set no longer has — lucide is one weight
 * throughout — and they stay so that a hundred call sites did not have to be
 * renamed to say the same thing. `myPlanFeatured` and `plannerMeal*` are the
 * same: distinctions that mattered to the old artwork and do not survive it.
 */
export const APP_ICONS = {
  /* Navigation and sections */
  dashboard: LayoutDashboard,
  clients: Users,
  calendar: Calendar,
  weeklyPlans: CalendarRange,
  mealPlans: ClipboardList,
  dishes: UtensilsCrossed,
  foods: Apple,
  whatsapp: MessageCircle,
  security: ShieldCheck,
  settings: Settings,
  contact: Phone,
  notes: FileText,

  /* The client portal's own tab bar */
  portalHome: House,
  myAppointments: CalendarCheck,
  myPlan: ClipboardList,
  progress: ChartLine,
  profile: User,
  portalHomeOutline: House,
  myAppointmentsOutline: CalendarCheck,
  progressOutline: ChartLine,
  profileOutline: User,
  myPlanFeatured: ClipboardList,

  /* Controls */
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  chevronStart: ChevronLeft,
  chevronEnd: ChevronRight,
  navigationMenu: Menu,
  signOut: LogOut,
  search: Search,
  add: Plus,
  close: X,
  trash: Trash2,
  edit: Pencil,
  copy: Copy,
  upload: Upload,
  refresh: RefreshCw,
  archive: Archive,
  restore: ArchiveRestore,
  filter: ListFilter,
  sort: ArrowUpDown,
  moreActions: MoreVertical,
  dragHandle: GripVertical,
  clearSlot: Eraser,
  repeat: Repeat,
  history: History,
  minus: Minus,
  eye: Eye,
  eyeOff: EyeOff,
  check: Check,
  back: ArrowLeft,

  /* Identity and access */
  email: Mail,
  person: User,
  lock: Lock,
  passkey: KeyRound,
  male: Mars,
  female: Venus,

  /* Marks and status */
  navNode: Circle,
  leaf: Leaf,
  attention: TriangleAlert,
  medical: Stethoscope,
  info: Info,
  notifications: Bell,
  topClients: Trophy,
  clock: Clock,
  addClient: UserPlus,
  bookAppointment: CalendarPlus,
  /*
    The portal's request rows, which read as a set: asked for a slot, asked to
    move one, asked to drop one. They were `refresh` and `close` — the generic
    reload and dismiss glyphs — beside `bookAppointment`'s calendar, so one
    third of the set said "appointment" and the rest said nothing in
    particular. Their own names, rather than re-pointing `refresh` and `close`,
    which the whole app draws with (`Spinner` is `refresh`).
  */
  rescheduleRequest: CalendarSync,
  cancelRequest: CalendarX,
  trend: TrendingUp,
  driftUp: TrendingUp,
  driftDown: TrendingDown,
  linkArrow: ArrowUpRight,

  /* Meals, in the two places they are drawn */
  mealBreakfast: Sunrise,
  mealSnack: Cookie,
  mealLunch: Sandwich,
  mealDinner: Utensils,
  mealBreakfastOutline: Sunrise,
  mealSnackOutline: Cookie,
  mealLunchOutline: Sandwich,
  mealDinnerOutline: Utensils,
  plannerMealBreakfast: Sunrise,
  plannerMealSnack: Cookie,
  plannerMealLunch: Sandwich,
  plannerMealDinner: Utensils,
  plannerMealHotDrink: Coffee,
  plannerMealBottle: CupSoda,
  plannerMealChefHeart: ChefHat,
  plannerMealChefMinimal: ChefHat,
  dish: Utensils,
  chat: MessageSquare,

  /* The client record's row markers */
  personOutline: User,
  heartOutline: Heart,
  clinicOutline: Building2,
  phoneOutline: Phone,
  emailOutline: Mail,
  locationOutline: MapPin,
  clockOutline: Clock,
  infoOutline: Info,
  mapOutline: Map,
  chatOutline: MessageSquare,
  goalOutline: Target,
  heightOutline: Ruler,
  /*
    Footprints, not `Activity`'s pulse line. This draws the activity *level* on
    the portal's health record — how much someone moves — and a heart-rate
    trace beside a height and a goal reads as a vital sign the clinic measured.
  */
  activityOutline: Footprints,
  weightOutline: Weight,
  conditionsOutline: Stethoscope,
  allergiesOutline: TriangleAlert,
  medicationsOutline: Pill,
  careNoteOutline: NotebookPen,
  clinicNameOutline: Building2,

  /* Support and legal */
  help: HelpCircle,
  /*
    Not a second shield. `security` is `ShieldCheck`, and the two sit six rows
    apart in the portal's one settings list — same shape, same weight, at 20px.
    A locked document separates it and pairs with `terms`'s plain one: both are
    things the clinic wrote about you, one of them about what it keeps.
  */
  privacy: FileLock,
  terms: FileText,
  suggestion: Lightbulb,

  /* The portal's home screen */
  dayComplete: Flame,
  mealCheckMark: CircleCheck,
  greetingSun: Sun,
  streak: Flame,
  encouragement: Sparkles,
  opensAt: DoorOpen,
  closesAt: DoorClosed,
  checkInEnergy: Zap,
  checkInSleep: Moon,
  checkInAppetite: Utensils,
  checkInMood: Smile,
  checkInWater: Droplet,

  /* The intake’s measurement and target fields */
  calories: Flame,
  protein: Beef,

  /* Settings groups */
  settingsAccount: CircleUser,
  settingsPreferences: SlidersHorizontal,
  settingsSupport: LifeBuoy,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof APP_ICONS;
