import { Command } from '@sapphire/framework';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type TextChannel } from 'discord.js';
import { createEmbed, sendError, sendSuccess } from '#utils/responses';
import { getConfig, getTeams, roster } from '#utils/sheets';
import { createCustomId, CustomId } from '#utils/customIds';

export class TradeOfferCommand extends Command {
	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction<'cached'>) {
		await Promise.all([interaction.guild.members.fetch(), interaction.deferReply()]);

		const user = interaction.options.getMember('user')!;
		const user2 = interaction.options.getMember('user2')!;

		if (!user || !user2) {
			return sendError(interaction, 'One of the users was not found in this server');
		}

		const rows = await roster.getRows();
		const teamName = roster.headerValues.find((team) => rows.some((row) => row.get(team) === user.displayName));

		if (!teamName) {
			return sendError(interaction, `The name ${user.displayName} was not found in the roster`);
		}

		const teamName2 = roster.headerValues.find((team) => rows.some((row) => row.get(team) === user2.displayName));
		if (!teamName2) {
			return sendError(interaction, `The name ${user2.displayName} was not found in the roster`);
		}

		if (teamName === teamName2) {
			return sendError(interaction, 'You cannot trade with yourself');
		}

		const teams = await getTeams();
		const owner = teams.find((team) => team.get('Team Name') === teamName)!.get('GM User ID');
		if (owner !== interaction.user.id) {
			return sendError(interaction, `Only <@${owner}> can offer to trade this player`);
		}

		const teamRole = interaction.guild.roles.cache.find((role) => role.name === teamName)!;
		const teamRole2 = interaction.guild.roles.cache.find((role) => role.name === teamName2)!;
		const owner2 = teams.find((team) => team.get('Team Name') === teamName2)!.get('GM User ID');
		const config = await getConfig();

		const tradeRole = interaction.guild.roles.cache.get(config.get('Board of Trades Role ID'))!;

		const embed = createEmbed(
			`**${user.displayName}** for **${user2.displayName}**\n\n🟢 Approved by <@${interaction.user.id}> (<@&${teamRole.id}>)\n🟡 Awaiting approval from <@${owner2}> (<@&${teamRole2.id}>)\n🟡 Awaiting approval from <@&${tradeRole.id}>`
		)
			.setTitle('Trade Offer')
			.setColor(tradeRole.color);

		const approveButton = new ButtonBuilder()
			.setCustomId(createCustomId(CustomId.Approve, user.id, user2.id, false, false))
			.setLabel('Approve')
			.setStyle(ButtonStyle.Success);

		const rejectButton = new ButtonBuilder()
			.setCustomId(createCustomId(CustomId.Reject, user.id, user2.id))
			.setLabel('Reject')
			.setStyle(ButtonStyle.Danger);

		const row = new ActionRowBuilder<ButtonBuilder>().setComponents(approveButton, rejectButton);
		const tradeChannel = interaction.guild.channels.cache.get(config.get('Trade Channel ID')) as TextChannel;

		const message = await tradeChannel.send({
			content: `${teamRole} ${teamRole2} ${tradeRole}`,
			embeds: [embed],
			components: [row]
		});

		await sendSuccess(interaction, `Trade offer sent [here](${message.url})`);
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((command) =>
			command
				.setName('trade-offer')
				.setDescription('Create a trade offer between teams')
				.addUserOption((option) =>
					option //
						.setName('user')
						.setDescription('The user to trade from your team')
						.setRequired(true)
				)
				.addUserOption((option) =>
					option //
						.setName('user2')
						.setDescription('The user to trade from the other team')
						.setRequired(true)
				)
		);
	}
}
