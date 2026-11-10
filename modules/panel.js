// แผงกดรับฉายา (Components V2): สร้างการ์ด + จัดการตอนกดปุ่ม/เลือกเมนู
// หมวดและฉายามาจาก settings.js → ค่าที่ตั้งด้วย /setup (หรือค่าเริ่มต้นใน config.js สำหรับเซิร์ฟบ้านเรา)
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { PANEL_COLOR } from '../config.js';
import { EPHEMERAL, divider, text } from '../util.js';
import { bannerOf, findRoleDef, groupsOf, isDangerousRole, resolveRole } from '../settings.js';

// Discord จำกัดข้อความ Components V2 ไว้ที่ 40 ชิ้นส่วน (นับรวมที่ซ้อนอยู่ข้างใน)
export const MAX_COMPONENTS = 40;

// นับจำนวนชิ้นส่วนของแผง (นับแบบเผื่อไว้ รวมแบนเนอร์เสมอ) ใช้เช็คก่อนเพิ่มฉายา
export function countComponents(groups) {
  let n = 1 + 2 + 1 + 1 + 1; // การ์ด + แบนเนอร์ + หัวข้อ + เส้นคั่นท้าย + ข้อความท้าย
  for (const g of groups) {
    n += 2; // เส้นคั่น + หัวข้อหมวด
    const k = g.roles.length;
    if (g.ui === 'select') n += k ? 2 : 0;
    else if (g.ui === 'toggle') n += k * 3;
    else n += Math.ceil(k / 5) + k;
  }
  return n;
}

const withEmoji = (builder, emoji) => (emoji ? builder.setEmoji(emoji) : builder);

// คืน { payload, missing } — missing = ฉายาที่หาไม่เจอในเซิร์ฟ (ถูกลบไปแล้ว) ซึ่งจะถูกข้ามไป
export function buildPanel(guild) {
  const missing = [];
  const groups = groupsOf(guild)
    .map((g) => ({
      ...g,
      roles: g.roles.filter((r) => {
        const ok = resolveRole(guild, r);
        if (!ok) missing.push(r.label);
        return ok;
      }),
    }))
    .filter((g) => g.roles.length);

  const card = new ContainerBuilder().setAccentColor(PANEL_COLOR);

  const banner = bannerOf(guild.id);
  if (banner) {
    card.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(banner)));
  }

  card.addTextDisplayComponents(text(`# 🐾 เลือกฉายาของคุณ\nยินดีต้อนรับสู่ **${guild.name}** กดรับฉายาที่ชอบได้เลย`));

  for (const group of groups) {
    card
      .addSeparatorComponents(divider())
      .addTextDisplayComponents(text(`### ${group.title}${group.description ? `\n-# ${group.description}` : ''}`));

    if (group.ui === 'select') {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`roles:${group.id}`)
        .setPlaceholder('เลือกฉายาที่ต้องการ')
        .setMinValues(0)
        .setMaxValues(group.roles.length)
        .addOptions(
          group.roles.map((r) => withEmoji(new StringSelectMenuOptionBuilder().setLabel(r.label).setValue(r.key), r.emoji)),
        );
      card.addActionRowComponents(new ActionRowBuilder().addComponents(menu));
    } else if (group.ui === 'toggle') {
      for (const r of group.roles) {
        card.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(text(`**${r.label}**${r.desc ? `\n-# ${r.desc}` : ''}`))
            .setButtonAccessory(
              withEmoji(new ButtonBuilder().setCustomId(`role:${r.key}`).setLabel('รับ / ถอด').setStyle(ButtonStyle.Secondary), r.emoji),
            ),
        );
      }
    } else {
      const buttons = group.roles.map((r) =>
        withEmoji(new ButtonBuilder().setCustomId(`role:${r.key}`).setLabel(r.label).setStyle(ButtonStyle.Secondary), r.emoji),
      );
      for (let i = 0; i < buttons.length; i += 5) {
        card.addActionRowComponents(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }
    }
  }

  card
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text('-# กดปุ่มซ้ำอีกครั้งเพื่อถอดฉายา • ฉายาใช้สำหรับแท็กตอนมีกิจกรรมต่างๆ'));

  return { payload: { components: [card], flags: MessageFlags.IsComponentsV2 }, missing, groups };
}

// เช็คฉายาก่อนแจกจริง คืนข้อความ error ถ้าแจกไม่ได้
function checkAssignable(guildRole, label) {
  if (!guildRole) return `ฉายา ${label} ถูกลบไปแล้ว (ให้แอดมินตั้งแผงใหม่)`;
  if (isDangerousRole(guildRole)) return `ฉายา ${label} มีสิทธิ์สูงเกินกว่าจะให้กดรับเอง (แจ้งแอดมิน)`;
  if (!guildRole.editable) return `บอทแจกฉายา ${label} ไม่ได้ เพราะฉายาบอทอยู่ต่ำกว่า (ให้แอดมินลากฉายาบอทขึ้นไปไว้เหนือฉายานี้)`;
  return null;
}

async function roleButton(i) {
  await i.deferReply(EPHEMERAL);

  const key = i.customId.slice('role:'.length);
  const found = findRoleDef(i.guild, key);
  if (!found) return i.editReply('❌ ไม่พบฉายานี้ในระบบ (ปุ่มอาจเก่าเกินไป ให้แอดมินส่งแผงใหม่ด้วย `/setup panel`)');

  await i.guild.roles.fetch();
  const { group, role: def } = found;
  const guildRole = resolveRole(i.guild, def);
  const problem = checkAssignable(guildRole, def.label);
  if (problem) return i.editReply(`❌ ${problem}`);

  const member = i.member;

  // กดซ้ำ = ถอดฉายา
  if (member.roles.cache.has(guildRole.id)) {
    await member.roles.remove(guildRole);
    return i.editReply(`➖ ถอดฉายา **${guildRole.name}** แล้ว`);
  }

  // กลุ่มแบบเลือกได้อย่างเดียว: ถอดอันอื่นในกลุ่มก่อน
  if (group.exclusive) {
    const others = group.roles
      .filter((r) => r.key !== def.key)
      .map((r) => resolveRole(i.guild, r))
      .filter((r) => r && r.editable && member.roles.cache.has(r.id));
    if (others.length) await member.roles.remove(others);
  }

  await member.roles.add(guildRole);
  return i.editReply(`➕ ได้รับฉายา **${guildRole.name}** แล้ว 🐾`);
}

// dropdown เลือกฉายาหลายอัน: ฉายาของกลุ่มจะถูกปรับให้ตรงกับที่เลือกเสมอ (ไม่เลือก = ถอดทั้งกลุ่ม)
async function roleSelect(i) {
  await i.deferReply(EPHEMERAL);

  const group = groupsOf(i.guild).find((g) => g.id === i.customId.slice('roles:'.length));
  if (!group) return i.editReply('❌ ไม่พบหมวดนี้ในระบบ (ให้แอดมินส่งแผงใหม่ด้วย `/setup panel`)');

  await i.guild.roles.fetch();
  const member = i.member;
  const toAdd = [];
  const toRemove = [];
  const problems = [];

  for (const def of group.roles) {
    const guildRole = resolveRole(i.guild, def);
    const wanted = i.values.includes(def.key);
    const has = guildRole ? member.roles.cache.has(guildRole.id) : false;

    // ถอดฉายาที่ไม่ได้เลือกได้เสมอ (ถ้าบอทถอดได้) แต่จะให้เพิ่มเฉพาะฉายาที่ปลอดภัย
    if (!wanted && has && guildRole.editable) {
      toRemove.push(guildRole);
      continue;
    }
    if (wanted && !has) {
      const problem = checkAssignable(guildRole, def.label);
      if (problem) problems.push(problem);
      else toAdd.push(guildRole);
    }
  }

  if (toAdd.length) await member.roles.add(toAdd);
  if (toRemove.length) await member.roles.remove(toRemove);

  const chosen = group.roles
    .filter((r) => i.values.includes(r.key))
    .map((r) => resolveRole(i.guild, r)?.name ?? r.label);
  let reply = chosen.length
    ? `✅ ฉายาของคุณในหมวดนี้ตอนนี้:\n${chosen.map((n) => `• ${n}`).join('\n')}`
    : '➖ ถอดฉายาในหมวดนี้ทั้งหมดแล้ว';
  if (problems.length) reply += `\n\n⚠️ ${problems.join('\n⚠️ ')}`;
  return i.editReply(reply);
}

export const componentHandlers = { role: roleButton, roles: roleSelect };
