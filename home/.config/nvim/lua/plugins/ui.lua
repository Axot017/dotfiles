-- UI plugins: theme, bufferline, lualine, noice

return {
  -- Colorscheme
  {
    "folke/tokyonight.nvim",
    lazy = false,
    priority = 1000,
    opts = {
      style = "storm",
    },
    config = function(_, opts)
      require("tokyonight").setup(opts)
      vim.cmd.colorscheme("tokyonight")
    end,
  },

  -- Buffer line (tabs)
  {
    "akinsho/bufferline.nvim",
    version = "*",
    dependencies = "nvim-tree/nvim-web-devicons",
    opts = {
      options = {
        separator_style = "slope",
        indicator = {
          style = nil,
        },
      },
    },
  },

  -- Status line
  {
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
  },

  -- Noice (cmdline, messages, notifications UI)
  {
    "folke/noice.nvim",
    event = "VeryLazy",
    dependencies = {
      "MunifTanjim/nui.nvim",
      "rcarriga/nvim-notify",
    },
    opts = {
      presets = {
        bottom_search = true,
      },
      cmdline = {
        view = "cmdline",
      },
    },
  },

  -- Notifications
  {
    "rcarriga/nvim-notify",
    opts = {
      timeout = 3000,
      max_height = function()
        return math.floor(vim.o.lines * 0.75)
      end,
      max_width = function()
        return math.floor(vim.o.columns * 0.75)
      end,
    },
  },

  -- Icons
  {
    "nvim-tree/nvim-web-devicons",
    lazy = true,
  },
}
