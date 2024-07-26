import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import creds from '../../../config/fiverr-spreadsheet-service-ab827ac1d527.json';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'];

const jwt = new JWT({
	email: creds.client_email,
	key: creds.private_key,
	scopes: SCOPES
});

const doc = new GoogleSpreadsheet('1z16REa_23MQt3Tw3Gt32QJLYX_8q_RbaCSyM73FrcMk', jwt);
await doc.loadInfo();

export const config = doc.sheetsByIndex[1];
export const roster = doc.sheetsByIndex[0];

export const getTeams = async () => {
	return config.getRows<{
		'AGM User ID': string;
		'Draft Role ID': string;
		'GM User ID': string;
		'Protected User ID': string;
		'Team Name': string;
	}>();
};
