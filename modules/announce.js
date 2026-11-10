import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { EPHEMERAL } from '../util.js';
export const commands = [
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('ส่งประกาศช่องทางติดต่อ')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((o) =>
      o.setName('channel')
        .setDescription('ห้องที่จะส่งประกาศ')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    ),
];

function buildEmbed() {
  return new EmbedBuilder()
    .setColor(0x0f0a00)
    .setTitle('MEOWPAILONG')
    .setThumbnail('https://img1.pic.in.th/images/MeowPailong-Discord-Cat-Badge.png') // ใส่ลิงก์โลโก้
    .setDescription(
`# <:Facebook_icon:1559790847187353620> Facebook :
> https://www.facebook.com/meowpailong

# <:tiktok_icon:1559791110090391572> Tiktok :
> https://www.tiktok.com/@meow.pailongbiker

# <:Instagram_icon:1559791097394503770> Instagram :
> https://www.instagram.com/joeei_shxbx/

# <:Gmail_icon:1559801882686394448> E-Mail :
> meowpailong.contact@gmail.com
    
Tag : @everyone`
    );
}

async function announceCommand(i) {
  const channel = i.options.getChannel('channel', true);

  try {
    const msg = await channel.send({
  embeds: [buildEmbed()],
  });

    if (channel.type === ChannelType.GuildAnnouncement) await msg.crosspost();

    return i.reply({ content: `✅ ส่งประกาศไปที่ ${channel} แล้ว`, ...EPHEMERAL });
  } catch (err) {
    console.error('announce error:', err);
    return i.reply({
      content: '❌ ส่งไม่สำเร็จ ตรวจสอบสิทธิ์บอทในห้องนั้น (View Channel, Send Messages, Embed Links, Mention Everyone)',
      ...EPHEMERAL,
    });
  }
}

export const commandHandlers = {
  announce: announceCommand,
};