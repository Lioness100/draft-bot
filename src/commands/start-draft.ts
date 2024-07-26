/* eslint-disable no-mixed-operators */
import { Command } from '@sapphire/framework';
import {
	ActionRowBuilder,
	type ComponentType,
	type GuildMember,
	type Message,
	type TextChannel,
	time,
	TimestampStyles,
	UserSelectMenuBuilder
} from 'discord.js';
import { createEmbed, sendError } from '#utils/responses';
import { getTeams, roster } from '#utils/sheets';
import { CustomId } from '#utils/customIds';

export class StartDraftCommand extends Command {
	private currentTeamIndex = 0;
	private currentRound = 1;
	private teams: Awaited<ReturnType<typeof getTeams>> = [];
	private readonly messages: { id: string; team: string }[] = [];
	private draftPicks: { member: GuildMember; round: number; salary: number; team: string }[] = [];
	private readonly salaries = [
		6_500_000, 6_000_000, 5_500_000, 5_000_000, 4_500_000, 4_000_000, 3_500_000, 3_000_000, 2_500_000, 2_000_000,
		1_500_000, 1_000_000, 500_000
	];

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction<'cached'>) {
		this.teams = await getTeams();
		this.currentTeamIndex = 0;
		this.currentRound = 1;
		this.draftPicks = (
			await Promise.all(
				this.teams.map((team) => {
					return Promise.all(
						[team.get('GM User ID'), team.get('AGM User ID'), team.get('Protected User ID')].map(
							async (id) => {
								const member = await interaction.guild.members.fetch(id);
								return { member, round: 0, salary: 6_500_000, team: team.get('Team Name') };
							}
						)
					);
				})
			)
		).flat();

		await Promise.all([roster.loadCells(), roster.loadHeaderRow()]);
		await Promise.all(
			this.teams.map(async (team) => {
				const picks = this.draftPicks.filter((pick) => pick.team === team.get('Team Name'));
				const content = picks
					.map((pick, idx) => `${idx + 1}. <@${pick.member.id}> - $${pick.salary}`)
					.join('\n');

				const channelName = (team.get('Team Name') as string).toLowerCase().replaceAll(' ', '-');
				const channel = interaction.guild.channels.cache.find(
					({ name }) => name === channelName
				) as TextChannel;

				const message = await channel.send(content);
				this.messages.push({ id: message.id, team: team.get('Team Name') });

				const teamColumn = roster.headerValues.indexOf(team.get('Team Name'));
				for (const [idx, pick] of picks.entries()) {
					roster.getCell(idx + 1, teamColumn).value = pick.member.displayName;
				}
			})
		);

		await roster.saveUpdatedCells();
		await this.nextTurn(interaction);
	}

	private async nextTurn(interaction: Command.ChatInputCommandInteraction<'cached'>, lastMessage?: Message<true>) {
		if (this.currentRound > 13) {
			const embed = createEmbed('Draft completed!').setTitle('OHL Draft');
			await lastMessage?.reply({ embeds: [embed] });
			return;
		}

		if (this.currentTeamIndex >= this.teams.length) {
			this.currentTeamIndex = 0;
			this.currentRound++;
			this.teams.reverse();

			if (this.currentRound > 13) {
				await this.nextTurn(interaction, lastMessage);
				return;
			}
		}

		const team = this.teams[this.currentTeamIndex];
		const userSelectMenu = new UserSelectMenuBuilder()
			.setCustomId(CustomId.SelectUser)
			.setPlaceholder('Select a player');

		const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelectMenu);
		const role = interaction.guild.roles.cache.find(({ name }) => name === team.get('Team Name'))!;

		const embed = createEmbed(
			`<@&${role.id}>, you're up! Your deadline to make a selection is ${time(new Date(Date.now() + 1000 * 60 * 2), TimestampStyles.RelativeTime)}`,
			role.color
		).setTitle(`OHL Draft - Round ${this.currentRound}`);

		const message = await (lastMessage
			? lastMessage.reply({
					content: `<@&${role.id}>`,
					embeds: [embed],
					components: [row]
				})
			: interaction.reply({
					content: `<@&${role.id}>`,
					embeds: [embed],
					components: [row],
					fetchReply: true
				}));

		try {
			const selectInteraction = await message.awaitMessageComponent<ComponentType.UserSelect>({
				time: 120_000,
				filter: async (i) => {
					if (i.user.id !== team.get('AGM User ID') && i.user.id !== team.get('GM User ID')) {
						await sendError(i, 'Only the GM or AGM can make a selection');
						return false;
					}

					const existingPick = this.draftPicks.find((pick) => pick.member.id === i.values[0]);
					if (existingPick) {
						await sendError(i, `This user has already been drafted by ${existingPick.team}`);
						return false;
					}

					const member = await interaction.guild.members.fetch(i.values[0]);
					const role = this.teams.map((team) => team.get('Draft Role ID')).find(Boolean)!;
					if (!member.roles.cache.has(role)) {
						await sendError(i, 'This user is not a player');
						return false;
					}

					return true;
				}
			});

			const selectedUserId = selectInteraction.values[0];
			const selectedUser = await interaction.guild.members.fetch(selectedUserId);

			embed.setDescription(`<@&${role.id}> selected **${selectedUser.displayName}**!`);

			await selectInteraction.update({
				embeds: [embed],
				components: []
			});

			this.draftPicks.push({
				team: team.get('Team Name'),
				member: selectedUser,
				round: this.currentRound,
				salary: this.salaries[this.currentRound - 1]
			});

			const picks = this.draftPicks.filter((pick) => pick.team === team.get('Team Name'));
			const teamColumn = roster.headerValues.indexOf(team.get('Team Name'));

			for (const [idx, pick] of picks.entries()) {
				roster.getCell(idx + 1, teamColumn).value = pick.member.displayName;
			}

			await roster.saveUpdatedCells();

			const channelName = (team.get('Team Name') as string).toLowerCase().replaceAll(' ', '-');
			const channel = interaction.guild.channels.cache.find(({ name }) => name === channelName) as TextChannel;
			const rosterMessageId = this.messages.find((msg) => msg.team === team.get('Team Name'))!;
			const rosterMessage = await channel.messages.fetch(rosterMessageId.id);
			const content = picks.map((pick, idx) => `${idx + 1}. <@${pick.member.id}> - $${pick.salary}`).join('\n');

			await rosterMessage.edit(content);
		} catch (error: any) {
			if (error.code !== 'InteractionCollectorError') {
				console.error(error);
			}

			embed.setDescription(`Time's up! No selection was made by <@&${role.id}>.`);
			await message.edit({ embeds: [embed], components: [] });
		} finally {
			this.currentTeamIndex++;
			await this.nextTurn(interaction, message);
		}
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((command) =>
			command //
				.setName('start-draft')
				.setDescription('Start draft')
		);
	}
}
