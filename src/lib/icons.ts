import {
  Apple,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowUpDown,
  ArrowUpRight,
  Beef,
  Banknote,
  BanknoteArrowUp,
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
  Compass,
  Cookie,
  Copy,
  CreditCard,
  CupSoda,
  DoorClosed,
  DoorOpen,
  Download,
  Droplet,
  Eraser,
  Eye,
  EyeOff,
  FileLock,
  FileText,
  Flame,
  Footprints,
  GripHorizontal,
  Heart,
  HelpCircle,
  History,
  House,
  Info,
  KeyRound,
  Languages,
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
  Printer,
  ReceiptText,
  RefreshCw,
  Repeat,
  RotateCcw,
  Ruler,
  Sandwich,
  Search,
  Settings,
  Share2,
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
  WalletMinimal,
  Utensils,
  UtensilsCrossed,
  Venus,
  Weight,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { WhatsappMark } from '@/components/ui/whatsapp-mark';

/**
 * A glyph drawn here rather than taken from lucide.
 *
 * It has to accept the props `Icon` hands every entry in the registry — the
 * className that sizes it, the aria attributes that hide or name it — so that
 * a call site cannot tell which of the two it asked for.
 */
type AppGlyph = (props: React.ComponentProps<'svg'>) => React.ReactElement;

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
  /*
    The two halves of the Subscriber group in the rail. `clients` is the group's
    own glyph — the people — and these two are the things you can read about
    them: the record, and the money. They are deliberately different pictures
    from `clients` rather than tints of it, because a submenu whose parent and
    children share one glyph is three of the same mark stacked in a column.
  */
  bills: ReceiptText,
  calendar: Calendar,
  weeklyPlans: CalendarRange,
  mealPlans: ClipboardList,
  dishes: UtensilsCrossed,
  foods: Apple,
  whatsapp: MessageCircle,
  /*
    The Bills row’s send control, and the one glyph here that is not lucide’s.

    It was `MessageCircleReply`, on the reasoning that the clinic is answering
    an account the subscriber already has. A reply arrow is the wrong half of
    that to draw: what a dietitian needs to know before pressing it is *where
    the bill is about to go*, because this is the only control on the page
    that reaches somebody outside the clinic and WhatsApp has no unsend. The
    channel is the fact worth a glyph; the direction is not.

    `whatsapp` above it is still lucide’s plain bubble and is a different job:
    it labels sections and callouts *about* the integration — Settings, the
    portal’s contact row — where a filled brand mark would sit heavier than
    the stroked icons beside it. This one is a send, and the mark is the
    point. See `WhatsappMark`.
  */
  sendBill: WhatsappMark,
  security: ShieldCheck,
  settings: Settings,
  language: Languages,
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
  install: Download,
  share: Share2,
  refresh: RefreshCw,
  archive: Archive,
  restore: ArchiveRestore,
  /*
    Recording money received from a subscriber — the wallet on every Bills row.

    `WalletMinimal` rather than `Wallet` or `WalletCards`: at the 20px a table
    action is drawn at, the fuller glyphs lose their card slot to the stroke
    weight and read as an anonymous rounded rectangle. The minimal one keeps one
    clasp and stays legible.
  */
  recordPayment: WalletMinimal,
  /*
    Adding a charge to a subscriber's account — the banknote beside the wallet.

    The two sit together on every Bills row and have to be told apart at 20px,
    which is why they are different *shapes* rather than two wallets: the wallet
    is money going into the drawer, the banknote's arrow is a line going up onto
    the account.
  */
  recordCharge: BanknoteArrowUp,
  /*
    Printing a bill — the same glyph whether it is one operation or the whole
    account, because printing is one verb. What differs is where it sits: the
    printer on the row prints the statement, and each one inside the menu
    prints the single bill it sits beside.
  */
  printBill: Printer,
  /*
    Paying by card — the second of the two ways money is taken, beside cash.

    A card *machine the clinic already owns*, not a gateway: this app takes no
    card details and contacts no bank. See the header of `src/db/schema/billing.ts`.
  */
  /*
    Paying in cash — the plain banknote, and deliberately not `recordCharge`'s.
    That one carries an arrow because it means *adding* money to an account;
    this one names a method, and an arrow on it would say the method moves
    money in a direction of its own.
  */
  paymentCash: Banknote,
  paymentCard: CreditCard,
  filter: ListFilter,
  sort: ArrowUpDown,
  moreActions: MoreVertical,
  /*
    Horizontal grip, not vertical.

    The vertical grip is the mark for a row in a list you reorder up and down —
    a settings list, a queue. A meal card moves in two dimensions here: to
    another slot in its own day, and to the same slot on another day. The
    horizontal bars read as "pick this up" rather than as "drag me up or down",
    and the glyph is wider than it is tall, which is the shape of the corner it
    sits in.
  */
  dragHandle: GripHorizontal,
  clearSlot: Eraser,
  repeat: Repeat,
  history: History,
  minus: Minus,
  eye: Eye,
  eyeOff: EyeOff,
  check: Check,
  back: ArrowLeft,
  /*
    Sparkles, which is what "generated" looks like across every product a
    dietitian has ever used. It shares the glyph with `encouragement` in the
    portal and that is fine — the names describe two different jobs, and either
    one can be re-pointed without touching the other.

    It replaced `refresh` on the planner's generate door, where a circular arrow
    said "do that again" on a button that had never been pressed.
  */
  ai: Sparkles,
  /* A counter-clockwise arrow: put back what it was, not fetch it again. */
  undo: RotateCcw,

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
    The guided tour's own mark, in the rail beside five destinations and in the
    eyebrow of every one of its cards.

    A compass rather than `help`'s question mark or `settingsSupport`'s life
    ring. Both of those are things you reach for when something has gone wrong;
    the tour is not troubleshooting, it is orientation — the reader is not stuck,
    they are new. A compass is also the only one of the three that is not already
    in the rail's neighbourhood: `help` heads the portal's support list.
  */
  guide: Compass,
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
  /*
   * `LucideIcon | AppGlyph`: one entry is WhatsApp’s own mark, which no icon
   * set ships. Anything drawn by hand still has to take the props `Icon`
   * hands every glyph, which is what the second half of this union holds it
   * to.
   */
} as const satisfies Record<string, LucideIcon | AppGlyph>;

export type IconName = keyof typeof APP_ICONS;
