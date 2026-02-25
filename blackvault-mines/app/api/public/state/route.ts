import { connectDb } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { PlatformSettingModel } from '@/models/PlatformSetting';
import { MinesGameModel } from '@/models/MinesGame';
import { UserModel } from '@/models/User';

export async function GET() {
  try {
    await connectDb();

    const [siteSetting, edgeSetting, activeGames, topUsers] = await Promise.all([
      PlatformSettingModel.findOne({ key: 'site_online' }),
      PlatformSettingModel.findOne({ key: 'house_edge' }),
      MinesGameModel.countDocuments({ status: 'active' }),
      UserModel.find({}, { username: 1, totalWon: 1 }).sort({ totalWon: -1 }).limit(5)
    ]);

    return ok({
      siteOnline: siteSetting ? Boolean(siteSetting.value) : true,
      houseEdge: Number(edgeSetting?.value ?? Number(process.env.HOUSE_EDGE || 0.01)),
      activeMinesGames: activeGames,
      topWinners: topUsers.map((user) => ({
        username: user.username,
        totalWon: Number(user.totalWon)
      }))
    });
  } catch {
    return fail('Unable to fetch public state', 500);
  }
}
