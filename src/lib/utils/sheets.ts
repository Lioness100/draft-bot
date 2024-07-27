import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import type { TextChannel } from 'discord.js';
import creds from '../../../config/fiverr-spreadsheet-service-ab827ac1d527.json';
import { env } from '#root/config';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'];

const jwt = new JWT({
	email: creds.client_email,
	key: creds.private_key,
	scopes: SCOPES
});

const doc = new GoogleSpreadsheet('1z16REa_23MQt3Tw3Gt32QJLYX_8q_RbaCSyM73FrcMk', jwt);
await doc.loadInfo();

export const config = doc.sheetsByIndex[env.isDev ? 2 : 1];
export const roster = doc.sheetsByIndex[0];

export const getTeams = async () => {
	return config.getRows<{
		'AGM User ID': string;
		'Alert Channel ID': string;
		'Draft Role ID': string;
		'GM User ID': string;
		'Protected User ID': string;
		'Team Name': string;
		'Time Manager User ID': string;
	}>();
};

export const getConfig = async () => {
	const rows = await config.getRows();
	return rows.find((row) => row.get('Time Manager User ID'))!;
};

const availableDoc = new GoogleSpreadsheet('1B0TqSzX5tIQswVgMt_dVrKkH4PurFpeC9lmWUw220D4', jwt);
await availableDoc.loadInfo();

export const available = availableDoc.sheetsByIndex[0];

export const removePlayerFromDraft = async (player: string, alertChannel: TextChannel) => {
	const rows = await available.getRows<{ Discord: string }>();
	const row = rows.find(
		(row) => (row.get('Discord') as string).replace(/#\d{4}$/, '').toLowerCase() === player.toLowerCase()
	);

	if (!row) {
		await alertChannel?.send(`${player} could not be found in the draft sheet.`).catch(console.error);
		return;
	}

	await row.delete();
};
