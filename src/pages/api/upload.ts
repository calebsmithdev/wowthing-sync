import axios from "axios"

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const {data} = await axios.post('https://wowthing.org/api/upload/', {
        apiKey: req.body.apiKey,
        luaFile: req.body.luaFile
      }, {
        headers: {
          'User-Agent': `WoWthing Sync - Tauri`
        }
      })

      res.status(200).json(data)
    } catch (error) {
      console.log(error)
      res.status(400).send(error.response)
    }
  }
}