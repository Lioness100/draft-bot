import { Command } from '@sapphire/framework';
import type { TextChannel } from 'discord.js';
import { roster } from '#utils/sheets';
import { sendSuccess } from '#utils/responses';

export class SyncCommand extends Command {
	private readonly salaries = [
		6_500_000, 6_000_000, 5_500_000, 5_000_000, 4_500_000, 4_000_000, 3_500_000, 3_000_000, 2_500_000, 2_000_000,
		1_500_000, 1_000_000, 500_000
	];

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction<'cached'>) {
		const [rows] = await Promise.all([
			roster.getRows(),
			interaction.deferReply(),
			roster.loadHeaderRow(),
			interaction.guild.members.fetch()
		]);

		await Promise.all(
			roster.headerValues.map(async (team) => {
				const players = rows.map((row) => row.get(team)).filter(Boolean) as (string & { id: string })[];
				const teamRole = interaction.guild.roles.cache.find((role) => role.name === team)!;

				await Promise.all([
					...teamRole.members.map(async (member) => {
						if (
							!players.some((player) => player === member.user.username || player === member.displayName)
						) {
							await member.roles.remove(teamRole).catch(() => null);
						}
					}),
					...players.map(async (player) => {
						const member = interaction.guild.members.cache.filter(
							({ user, displayName }) => displayName === player || user.username === player
						);

						if (member?.first()) {
							// eslint-disable-next-line require-atomic-updates
							player.id = member.first()!.id;
							await member
								.first()!
								.roles.add(teamRole)
								.catch(() => null);
						}
					})
				]);

				const content = players
					.map(
						(pick, idx) =>
							`${idx + 1}. ${pick.id ? `<@${pick.id}>` : pick} - $${this.salaries[Math.max(0, idx - 2)]}`
					)
					.join('\n');

				const channelName = team.toLowerCase().replaceAll(' ', '-');
				const channel = interaction.guild.channels.cache.find(({ name }) => name === channelName) as
					| TextChannel
					| undefined;

				if (channel) {
					const message = await channel.messages.fetch({ limit: 5 });
					const myMessage = message.find((msg) => msg.author.id === interaction.client.user.id);
					await (myMessage ? myMessage.edit(content) : channel.send(content));
				}
			})
		);

		await sendSuccess(interaction, 'Rosters synced');
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((command) =>
			command //
				.setName('sync')
				.setDescription('Sync Discord rosters with Google Sheets')
		);
	}
}
