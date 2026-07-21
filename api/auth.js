import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { action, email, password, channelId, channelName } = req.body;

  try {
    switch (action) {
      case "signup": {
        if (!email || !password || !channelId) {
          return res.status(400).json({ error: "missing fields" });
        }

        // validate channel slug
        if (!/^[a-z0-9-]{3,30}$/.test(channelId)) {
          return res.status(400).json({ error: "invalid_slug", message: "3-30자 영문 소문자, 숫자, 하이픈만 가능합니다" });
        }

        // check if channel exists
        const { data: existing } = await supabase.from("channels").select("id").eq("id", channelId).single();
        if (existing) {
          return res.status(409).json({ error: "slug_taken", message: "이미 사용 중인 채널 주소입니다" });
        }

        // create auth user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (authError) {
          if (authError.message.includes("already")) {
            return res.status(409).json({ error: "email_taken", message: "이미 가입된 이메일입니다" });
          }
          throw authError;
        }

        // create channel
        const { error: channelError } = await supabase.from("channels").insert({
          id: channelId,
          owner_uid: authData.user.id,
          name: channelName || channelId,
        });
        if (channelError) throw channelError;

        return res.json({ ok: true, userId: authData.user.id, channelId });
      }

      case "login": {
        if (!email || !password) {
          return res.status(400).json({ error: "missing fields" });
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          return res.status(401).json({ error: "invalid_credentials", message: "이메일 또는 비밀번호가 틀렸습니다" });
        }

        // get user's channels
        const { data: channels } = await supabase
          .from("channels")
          .select("id, name, profile_image")
          .eq("owner_uid", data.user.id);

        return res.json({
          ok: true,
          session: data.session,
          user: { id: data.user.id, email: data.user.email },
          channels: channels || [],
        });
      }

      case "create-channel": {
        const { token } = req.body;
        if (!token || !channelId) {
          return res.status(400).json({ error: "missing fields" });
        }

        // verify token
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return res.status(401).json({ error: "unauthorized" });

        // validate slug
        if (!/^[a-z0-9-]{3,30}$/.test(channelId)) {
          return res.status(400).json({ error: "invalid_slug" });
        }

        // check existence
        const { data: existing } = await supabase.from("channels").select("id").eq("id", channelId).single();
        if (existing) return res.status(409).json({ error: "slug_taken" });

        // create
        const { error } = await supabase.from("channels").insert({
          id: channelId,
          owner_uid: user.id,
          name: channelName || channelId,
        });
        if (error) throw error;

        return res.json({ ok: true, channelId });
      }

      default:
        return res.status(400).json({ error: "unknown action" });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
