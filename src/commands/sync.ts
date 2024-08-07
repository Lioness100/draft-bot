import { Command } from '@sapphire/framework';
import type { TextChannel } from 'discord.js';
import { roster } from '#utils/sheets';
import { sendSuccess } from '#utils/responses';

export class SyncCommand extends Command {
	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction<'cached'>) {
		const [rows] = await Promise.all([
			roster.getRows(),
			interaction.deferReply({ ephemeral: true }),
			roster.loadHeaderRow(),
			interaction.guild.members.fetch()
		]);

		console.log(roster.headerValues, rows.length);

		await Promise.all(
			roster.headerValues.map(async (team) => {
				const players = rows
					.map((row) => row.get(team))
					.filter(Boolean)
					.map((str: string) => ({ name: str.split(' - ')[0], salary: str.split(' - ')[1] }));

				const teamRole = interaction.guild.roles.cache.find((role) => role.name === team)!;
				const ids = new Map<string, string>();

				await Promise.all([
					...teamRole.members.map(async (member) => {
						if (
							!players.some(
								(player) => player.name === member.user.username || player.name === member.displayName
							)
						) {
							await member.roles.remove(teamRole).catch(() => null);
						}
					}),
					...players.map(async (player) => {
						const member = interaction.guild.members.cache.filter(
							({ user, displayName }) => displayName === player.name || user.username === player.name
						);

						if (member?.first()) {
							ids.set(player.name, member.first()!.id);
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
							`${idx + 1}. ${ids.has(pick.name) ? `<@${ids.get(pick.name)}>` : pick} - $${pick.salary}`
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
