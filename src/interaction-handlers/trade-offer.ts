/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandlerTypes, InteractionHandler } from '@sapphire/framework';
import { EmbedBuilder, type TextChannel, type ButtonInteraction } from 'discord.js';
import { CustomId, parseCustomId } from '#utils/customIds';
import { disableComponents, sendError, sendSuccess } from '#utils/responses';
import { getConfig, getTeams, roster } from '#utils/sheets';

@ApplyOptions<InteractionHandler.Options>({ interactionHandlerType: InteractionHandlerTypes.Button })
export class TradeOfferInteractionHandler extends InteractionHandler {
	// eslint-disable-next-line sonarjs/cognitive-complexity
	public override async run(
		interaction: ButtonInteraction<'cached'>,
		[action, [user, user2, gm2, board]]: InteractionHandler.ParseResult<this>
	) {
		await Promise.all([interaction.guild.members.fetch(), interaction.deferReply({ ephemeral: true })]);

		const member = await interaction.guild.members.fetch(user);
		const member2 = await interaction.guild.members.fetch(user2);

		if (!member || !member2) {
			return sendError(interaction, 'One of the users was not found in this server');
		}

		const rows = await roster.getRows();
		const teamName = roster.headerValues.find((team) => rows.some((row) => row.get(team) === member.displayName));

		if (!teamName) {
			return sendError(interaction, `The name ${member.displayName} was not found in the roster`);
		}

		const teamName2 = roster.headerValues.find((team) => rows.some((row) => row.get(team) === member2.displayName));
		if (!teamName2) {
			return sendError(interaction, `The name ${member2.displayName} was not found in the roster`);
		}

		if (teamName === teamName2) {
			console.log(teamName, teamName2);
			return sendError(interaction, 'Both players are now on the same team');
		}

		const teams = await getTeams();
		const owner = teams.find((team) => team.get('Team Name') === teamName)!.get('GM User ID');
		const owner2 = teams.find((team) => team.get('Team Name') === teamName2)!.get('GM User ID');

		const config = await getConfig();
		const tradeRole = interaction.guild.roles.cache.get(config.get('Board of Trades Role ID'))!;

		if (
			interaction.user.id !== owner &&
			interaction.user.id !== owner2 &&
			!interaction.member.roles.cache.has(tradeRole.id)
		) {
			return sendError(interaction, `You can't approve or deny this offer`);
		}

		if (
			action === CustomId.Approve &&
			(owner === interaction.user.id ||
				(gm2 && owner2 === interaction.user.id) ||
				(board && interaction.member.roles.cache.has(tradeRole.id)))
		) {
			return sendError(interaction, `You've already approved this trade`);
		}

		const teamRole = interaction.guild.roles.cache.find((role) => role.name === teamName)!;
		const teamRole2 = interaction.guild.roles.cache.find((role) => role.name === teamName2)!;

		if (action === CustomId.Reject) {
			const embed = EmbedBuilder.from(interaction.message.embeds[0]).setDescription(
				`**${member.displayName}** for **${member2.displayName}**\n\n${interaction.user.id === owner.id ? `🔴 Rejected by ` : `🟢 Approved by `} <@${owner}> (<@&${teamRole.id}>)\n${interaction.user.id === owner2 ? `🔴 Rejected by ` : gm2 ? `🟢 Approved by ` : `🟡 Awaiting approval from `} <@${owner2}> (<@&${teamRole2.id}>)\n${
					interaction.member.roles.cache.has(tradeRole.id)
						? `🔴 Rejected by`
						: board
							? `🟢 Approved by`
							: `🟡 Awaiting approval from `
				} <@&${tradeRole.id}>`
			);

			await sendSuccess(interaction, 'Trade rejected');

			await interaction.message.edit({
				embeds: [embed],
				components: disableComponents(interaction.message.components)
			});
			return;
		}

		if (interaction.user.id === owner2) {
			gm2 = true;
		} else if (interaction.member.roles.cache.has(tradeRole.id)) {
			board = true;
		}

		const embed = EmbedBuilder.from(interaction.message.embeds[0]).setDescription(
			`**${member.displayName}** for **${member2.displayName}**\n\n🟢 Approved by <@${owner}> (<@&${teamRole.id}>)\n${gm2 ? `🟢 Approved by ` : `🟡 Awaiting approval from `} <@${owner2}> (<@&${teamRole2.id})\n${
				board ? `🟢 Approved by` : `🟡 Awaiting approval from `
			} <@&${tradeRole.id}>`
		);

		await sendSuccess(interaction, 'Trade approved');
		await interaction.message.edit({
			embeds: [embed],
			components: gm2 && board ? disableComponents(interaction.message.components) : undefined
		});

		if (gm2 && board) {
			const rows = await roster.getRows();
			const team = rows.find((row) => roster.headerValues.some((team) => row.get(team) === member.displayName));
			const team2 = rows.find((row) => roster.headerValues.some((team) => row.get(team) === member2.displayName));

			team?.set(teamName, member2.displayName);
			team2?.set(teamName2, member.displayName);

			await Promise.all([team?.save(), team2?.save()]);

			const channel = interaction.guild.channels.cache.find(
				(channel) => channel.name === teamName.toLowerCase().replaceAll(' ', '-')
			) as TextChannel;
			const channel2 = interaction.guild.channels.cache.find(
				(channel) => channel.name === teamName2.toLowerCase().replaceAll(' ', '-')
			) as TextChannel;

			const [messages, messages2] = await Promise.all([channel.messages.fetch(), channel2.messages.fetch()]);
			const message = messages.find((message) => message.author.id === interaction.client.user.id)!;
			const message2 = messages2.find((message) => message.author.id === interaction.client.user.id)!;

			const display = message.content
				.split('\n')
				.find((line) => line.includes(member.id))!
				.split(' ')
				.slice(1)
				.join(' ');

			const display2 = message2.content
				.split('\n')
				.find((line) => line.includes(member2.id))!
				.split(' ')
				.slice(1)
				.join(' ');

			await Promise.all([
				message.edit(message.content.replace(display, display2)),
				message2.edit(message2.content.replace(display2, display))
			]);
		}
	}

	public override parse(interaction: ButtonInteraction) {
		return parseCustomId(interaction.customId, { filter: [CustomId.Approve, CustomId.Reject] });
	}
}
