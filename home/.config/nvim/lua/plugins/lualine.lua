return {
  "nvim-lualine/lualine.nvim",
  dependencies = {
    "nvim-tree/nvim-web-devicons",
    "folke/noice.nvim",
  },
  opts = function()
    return {
      options = {
        theme = "horizon",
        globalstatus = true,
      },
      sections = {
        lualine_x = {
          {
            function()
              return require("noice").api.statusline.mode.get()
            end,
            cond = function()
              return package.loaded["noice"] and require("noice").api.statusline.mode.has()
            end,
            color = { fg = "#ff9e64" },
          },
          "encoding",
          "fileformat",
          "filetype",
        },
      },
    }
  end,
}
