require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActivityType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const os = require("os");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const prefix = "!";
const OWNER_ID = "1354193214424354867";

// ===== GLOBAL PANEL STATE =====
let statusMessage = null;
let panelInterval = null;
let cpuHistory = [];
let ramHistory = [];
let alertCooldown = false;

// ===== UTIL FUNCTIONS =====
function getActivityType(type) {
  switch (type) {
    case "playing": return ActivityType.Playing;
    case "watching": return ActivityType.Watching;
    case "listening": return ActivityType.Listening;
    case "streaming": return ActivityType.Streaming;
    case "competing": return ActivityType.Competing;
    default: return ActivityType.Playing;
  }
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  seconds %= 86400;
  const h = Math.floor(seconds / 3600);
  seconds %= 3600;
  const m = Math.floor(seconds / 60);
  seconds %= 60;
  return `${d}d ${h}h ${m}m ${Math.floor(seconds)}s`;
}

function formatBytes(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

function getCPUUsage() {
  const cpus = os.cpus();
  let idle = 0, total = 0;

  cpus.forEach(core => {
    for (let type in core.times) total += core.times[type];
    idle += core.times.idle;
  });

  return ((1 - idle / total) * 100).toFixed(2);
}

function getRAMUsagePercent() {
  const used = process.memoryUsage().heapUsed;
  const total = os.totalmem();
  return ((used / total) * 100).toFixed(2);
}

function createGraph(data) {
  const maxBars = 10;
  const bars = data.slice(-maxBars);

  return bars.map(v => {
    const level = Math.round(v / 10);
    return "▰".repeat(level) + "▱".repeat(10 - level) + ` ${v}%`;
  }).join("\n");
}

// ===== LOGGING =====
async function log(text) {
  console.log("[LOG]", text);

  if (!process.env.LOG_CHANNEL_ID) return;

  try {
    const ch = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
    if (ch) ch.send(`📜 ${text}`);
  } catch (e) {
    console.error("Log error:", e);
  }
}

async function logError(error) {
  console.error("[ERROR]", error);

  if (!process.env.LOG_CHANNEL_ID) return;

  try {
    const ch = await client.channels.fetch(process.env.LOG_CHANNEL_ID);

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Bot Error")
      .setDescription(`\`\`\`${error.message || error}\`\`\``)
      .setColor("Red")
      .setTimestamp();

    if (ch) ch.send({ embeds: [embed] });
  } catch (e) {
    console.error("Error log failed:", e);
  }
}

// ===== GLOBAL ERROR HANDLERS =====
process.on("unhandledRejection", logError);
process.on("uncaughtException", logError);

// ===== READY =====
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: process.env.BOT_STATUS || "online",
    activities: [{
      name: process.env.ACTIVITY_NAME,
      type: getActivityType(process.env.ACTIVITY_TYPE)
    }]
  });

  log("Bot started");

  // 🚨 AUTO ALERT SYSTEM
  setInterval(async () => {
    if (alertCooldown) return;

    const cpu = parseFloat(getCPUUsage());
    const ram = parseFloat(getRAMUsagePercent());

    if (cpu > process.env.ALERT_CPU || ram > process.env.ALERT_RAM) {
      alertCooldown = true;

      const embed = new EmbedBuilder()
        .setTitle("🚨 Performance Alert")
        .addFields(
          { name: "CPU", value: `${cpu}%`, inline: true },
          { name: "RAM", value: `${ram}%`, inline: true }
        )
        .setColor("Red")
        .setTimestamp();

      try {
        const ch = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
        if (ch) ch.send({ embeds: [embed] });
      } catch {}

      log(`ALERT: CPU ${cpu}% | RAM ${ram}%`);

      setTimeout(() => alertCooldown = false, 60000);
    }
  }, 10000);
});

// ===== COMMANDS =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  log(`${message.author.tag} used ${command}`);

  try {

    // 🔹 BOT STATUS
    if (command === "botstatus") {
      const embed = new EmbedBuilder()
        .setTitle("🤖 Bot Status")
        .addFields(
          { name: "Latency", value: `${client.ws.ping}ms`, inline: true },
          { name: "Uptime", value: formatUptime(process.uptime()), inline: true },
          { name: "CPU", value: `${getCPUUsage()}%`, inline: true },
          { name: "RAM", value: `${formatBytes(process.memoryUsage().heapUsed)} / ${formatBytes(os.totalmem())}`, inline: true },
          { name: "Host", value: "OriHost", inline: true },
          { name: "Developer", value: "area", inline: true },
          { name: "Location", value: "New York", inline: true }
        )
        .setColor("Blue");

      return message.reply({ embeds: [embed] });
    }

    // 🔹 CHANGE STATUS
    if (command === "changestat") {
      const status = args[0];

      if (!["online", "idle", "dnd", "invisible"].includes(status)) {
        return message.reply("Use: !changestat online | idle | dnd | invisible");
      }

      client.user.setPresence({ status });

      log(`Status changed to ${status}`);

      return message.reply(`✅ Status changed to ${status}`);
    }

    // 🔹 SAFIBUM
    if (command === "safibum") {
      return message.reply("Safi you're so funny and annoying :)");
    }

    // 🔹 RESTART (OWNER ONLY)
    if (command === "restart") {
      if (message.author.id !== OWNER_ID) {
        log("Unauthorized restart attempt");
        return message.reply("❌ Not allowed.");
      }

      await message.reply("♻️ Restarting...");
      log("Restarting bot");

      process.exit();
    }

    // 🔹 PANEL
    if (command === "panel") {

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("start").setLabel("▶️ Start").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("stop").setLabel("⏹ Stop").setStyle(ButtonStyle.Danger)
      );

      const msg = await message.reply({
        embeds: [new EmbedBuilder().setTitle("📡 Panel").setDescription("Use buttons").setColor("Blue")],
        components: [row]
      });

      statusMessage = msg;
      cpuHistory = [];
      ramHistory = [];
    }

  } catch (err) {
    logError(err);
    message.reply("⚠️ Error occurred.");
  }
});

// ===== BUTTON HANDLER =====
client.on("interactionCreate", async (i) => {
  if (!i.isButton()) return;

  if (i.customId === "start") {
    if (panelInterval) return i.reply({ content: "Already running", ephemeral: true });

    i.reply({ content: "Started panel", ephemeral: true });

    panelInterval = setInterval(async () => {
      const cpu = parseFloat(getCPUUsage());
      const ram = parseFloat(getRAMUsagePercent());

      cpuHistory.push(cpu);
      ramHistory.push(ram);

      const embed = new EmbedBuilder()
        .setTitle("📡 Live Panel")
        .addFields(
          { name: "CPU", value: `${cpu}%`, inline: true },
          { name: "RAM", value: `${ram}%`, inline: true },
          { name: "CPU Graph", value: "```" + createGraph(cpuHistory) + "```" },
          { name: "RAM Graph", value: "```" + createGraph(ramHistory) + "```" }
        )
        .setColor("Blue")
        .setTimestamp();

      try {
        await statusMessage.edit({ embeds: [embed] });
      } catch {
        clearInterval(panelInterval);
        panelInterval = null;
      }

    }, 5000);
  }

  if (i.customId === "stop") {
    if (!panelInterval) return i.reply({ content: "Not running", ephemeral: true });

    clearInterval(panelInterval);
    panelInterval = null;

    i.reply({ content: "Stopped panel", ephemeral: true });
  }
});

client.login(process.env.BOT_TOKEN);
