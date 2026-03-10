import "dotenv/config";
import { Bot, Context, InlineKeyboard, InputFile, session } from "grammy";
import type { SessionFlavor } from "grammy";
import path from "path";
import { fileURLToPath } from "url";
import { t } from "./t";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──────────────────────────────────────────────
// Змінні середовища (.env)
// ──────────────────────────────────────────────

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("❌ BOT_TOKEN не знайдено!");
    process.exit(1);
}

const FEE = {
    telegram: parseFloat(process.env.TELEGRAM_FEE ?? "0.30"),
    ours: parseFloat(process.env.OUR_FEE ?? "0.05"),
    starPriceUsd: parseFloat(process.env.STAR_PRICE_USD ?? "0.013"),
};

/**
 * Скільки зірок потрібно заплатити, щоб ми отримали `amountUsd` після всіх комісій.
 *
 * Формула:
 *   до_telegram = amount × (1 + ourFee)           → додаємо нашу комісію
 *   до_зірок    = до_telegram / (1 - telegramFee) → нівелюємо комісію Telegram
 *   зірок       = ceil(до_зірок / starPrice)
 */

function calcStars(amountUsd: number): number {
    const withOurFee = amountUsd * (1 + FEE.ours);
    const withTelegramFee = withOurFee / (1 - FEE.telegram);
    return Math.ceil(withTelegramFee / FEE.starPriceUsd);
}

// ──────────────────────────────────────────────
// Session — зберігаємо стан розмови
// ──────────────────────────────────────────────

interface SessionData {
    step?: "awaiting_amount";
    topupMsgId?: number; // id повідомлення "введіть суму" — щоб потім видалити
}

type MyContext = Context & SessionFlavor<SessionData>;

const buildText = (title: string, body: string) => `${title}\n\n${body}`;

// ──────────────────────────────────────────────
// Посилання
// ──────────────────────────────────────────────

const LINKS = {
    clubgg: "https://clubgg.app.link/reV4p4UPm1b",
    buy: "https://help.send.tg/ru/articles/9819562-%D0%BA%D0%B0%D0%BA-%D0%BA%D1%83%D0%BF%D0%B8%D1%82%D1%8C-%D0%BC%D0%BE%D0%BD%D0%B5%D1%82%D1%8B",
    sell: "https://help.send.tg/ru/articles/9819582-%D0%BA%D0%B0%D0%BA-%D0%BF%D1%80%D0%BE%D0%B4%D0%B0%D1%82%D1%8C-%D0%BC%D0%BE%D0%BD%D0%B5%D1%82%D1%8B",
    support: null as string | null,
};

const LOGO_PATH = path.join(__dirname, "logo.jpg");

// ──────────────────────────────────────────────
// Клавіатури
// ──────────────────────────────────────────────

const mainMenuKeyboard = () =>
    new InlineKeyboard()
        .url(t.btn_download, LINKS.clubgg)
        .row()
        .text(t.btn_register, "register")
        .row()
        .text(t.btn_table, "table")
        .row()
        .text(t.btn_crypto, "crypto")
        .row()
        .text(t.btn_support, "support")
        .row()
        .text(t.btn_topup, "topup");

const backKeyboard = () =>
    new InlineKeyboard().text(t.btn_back, "start").text(t.btn_start, "start");

const cryptoKeyboard = () =>
    new InlineKeyboard()
        .url(t.btn_buy, LINKS.buy)
        .row()
        .url(t.btn_sell, LINKS.sell)
        .row()
        .text(t.btn_back, "start")
        .text(t.btn_start, "start");

const paymentKeyboard = (amount: number) => {
    const stars = calcStars(amount);
    return new InlineKeyboard()
        .text(t.btn_pay_stars(stars), `pay_stars:${amount}`)
        .row()
        .text(t.btn_pay_crypto, "pay_soon")
        .row()
        .text(t.btn_pay_card, "pay_soon")
        .row()
        .text(t.btn_change_amount, "topup")
        .row()
        .text(t.btn_start, "start");
};

// ──────────────────────────────────────────────
// Хелпери
// ──────────────────────────────────────────────

async function sendMainMenu(ctx: MyContext) {
    ctx.session.step = undefined;
    await ctx.replyWithPhoto(new InputFile(LOGO_PATH), {
        caption: t.main_title,
        parse_mode: "MarkdownV2",
        reply_markup: mainMenuKeyboard(),
    });
}

// ──────────────────────────────────────────────
// Бот
// ──────────────────────────────────────────────

const bot = new Bot<MyContext>(BOT_TOKEN);

bot.use(session({ initial: (): SessionData => ({}) }));

bot.api.setMyCommands([{ command: "start", description: "🏠 Головне меню" }]);

// ── /start ──
bot.command("start", (ctx) => sendMainMenu(ctx));

// ── Головне меню / Спочатку ──
bot.callbackQuery("start", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = undefined;
    await ctx.deleteMessage();
    await sendMainMenu(ctx);
});

// ── Реєстрація ──
bot.callbackQuery("register", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageCaption({
        caption: buildText(t.register_title, t.register_body),
        parse_mode: "MarkdownV2",
        reply_markup: backKeyboard(),
    });
});

// ── За стіл VISAVI ──
bot.callbackQuery("table", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageCaption({
        caption: buildText(t.table_title, t.table_body),
        parse_mode: "MarkdownV2",
        reply_markup: backKeyboard(),
    });
});

// ── Криптогаманець ──
bot.callbackQuery("crypto", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageCaption({
        caption: buildText(t.crypto_title, t.crypto_body),
        parse_mode: "MarkdownV2",
        reply_markup: cryptoKeyboard(),
    });
});

// ── Підтримка ──
bot.callbackQuery("support", async (ctx) => {
    await ctx.answerCallbackQuery({ text: t.support_soon, show_alert: true });
});

// ── Поповнити баланс — запит суми ──
bot.callbackQuery("topup", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = "awaiting_amount";

    // Видаляємо попереднє повідомлення (фото/меню)
    await ctx.deleteMessage();

    const msg = await ctx.reply(t.topup_ask, { parse_mode: "MarkdownV2" });
    ctx.session.topupMsgId = msg.message_id;
});

// ── Незабаром (крипта/карта) ──
bot.callbackQuery("pay_soon", async (ctx) => {
    await ctx.answerCallbackQuery({ text: t.soon_alert, show_alert: true });
});

// ── Оплата зірками ──
bot.callbackQuery(/^pay_stars:(\d+(?:\.\d+)?)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const amount = parseFloat(ctx.match[1]);
    const stars = calcStars(amount);

    await ctx.deleteMessage();

    await ctx.api.sendInvoice(
        ctx.chat!.id,
        "💳 Поповнення балансу VISAVI",
        `Поповнення на $${amount} USD · ${stars} ⭐`,
        `topup_${amount}`, // payload — можна розпарсити у pre_checkout
        "XTR", // валюта — Telegram Stars
        [{ label: `$${amount} USD`, amount: stars }],
    );
});

// ── Pre-checkout (обов'язковий хендлер для Stars) ──
bot.on("pre_checkout_query", async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
});

// ── Успішна оплата ──
bot.on("message:successful_payment", async (ctx) => {
    const payload = ctx.message.successful_payment.invoice_payload;
    const amount = parseFloat(payload.replace("topup_", ""));

    await ctx.reply(t.payment_success(amount), { parse_mode: "MarkdownV2" });

    // TODO: зарахувати баланс користувачу в БД
    console.log(`✅ Оплата: userId=${ctx.from.id} amount=$${amount}`);
});

// ── Обробка введення суми ──
bot.on("message:text", async (ctx) => {
    if (ctx.session.step !== "awaiting_amount") return;

    const input = ctx.message.text.trim().replace(",", ".");
    const amount = parseFloat(input);

    // Видаляємо повідомлення користувача
    await ctx.deleteMessage();

    // Валідація
    if (isNaN(amount) || amount < 10 || amount > 10000) {
        // Редагуємо попереднє повідомлення з помилкою
        if (ctx.session.topupMsgId) {
            await ctx.api.editMessageText(
                ctx.chat.id,
                ctx.session.topupMsgId,
                t.topup_invalid,
                { parse_mode: "MarkdownV2" },
            );
        }
        return;
    }

    // Сума валідна — показуємо вибір методу оплати
    ctx.session.step = undefined;
    const stars = calcStars(amount);

    if (ctx.session.topupMsgId) {
        await ctx.api.editMessageText(
            ctx.chat.id,
            ctx.session.topupMsgId,
            t.topup_method(amount, stars),
            {
                parse_mode: "MarkdownV2",
                reply_markup: paymentKeyboard(amount),
            },
        );
    }
});

// ──────────────────────────────────────────────
// Запуск
// ──────────────────────────────────────────────

bot.catch((err) => {
    console.error("Bot error:", err);
});
// Graceful запуск
(async () => {
    try {
        await bot.start({
            onStart(botInfo) {
                console.log("🚀 Бот запущен! ", botInfo.first_name);
            },
        });
    } catch (err) {
        console.error("🚨 Ошибка запуска:", err);
        process.exit(1);
    }
})();


process.on("SIGINT", async () => {
    console.log("\n🛑 Остановка...");
    await bot.stop();
    console.log("\n🛑 Стоп");
    process.exit(0);
});

