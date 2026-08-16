local initialized = false
local supportPanel

local function SetButtonText(button, text)
    if button and button.SetText then
        button:SetText(text)
    end
end

local function BrandTitle()
    if not KnowledgeBaseFrame then
        return
    end

    local regions = { KnowledgeBaseFrame:GetRegions() }

    for _, region in ipairs(regions) do
        if region.GetText and region.SetText then
            local currentText = region:GetText()

            if currentText == "Knowledge Base" or
               currentText == KNOWLEDGEBASE_FRAME_TITLE then
                region:SetText("Shadowmourne Support")
            end
        end
    end
end

local function CreateSupportPanel()
    if supportPanel or not KnowledgeBaseFrame then
        return
    end

    supportPanel = CreateFrame(
        "Frame",
        "ShadowmourneSupportPanel",
        KnowledgeBaseFrame
    )

    supportPanel:SetPoint(
        "TOPLEFT",
        KnowledgeBaseFrame,
        "TOPLEFT",
        30,
        -145
    )

    supportPanel:SetPoint(
        "BOTTOMRIGHT",
        KnowledgeBaseFrame,
        "BOTTOMRIGHT",
        -65,
        90
    )

    supportPanel:SetFrameLevel(
        KnowledgeBaseFrame:GetFrameLevel() + 10
    )

    local heading = supportPanel:CreateFontString(
        nil,
        "OVERLAY",
        "GameFontNormalLarge"
    )

    heading:SetPoint("TOP", supportPanel, "TOP", 0, -35)

    heading:SetText(
        "|cffffcc00Welcome to Shadowmourne Support|r"
    )

    local message = supportPanel:CreateFontString(
        nil,
        "OVERLAY",
        "GameFontHighlight"
    )

    message:SetPoint("TOP", heading, "BOTTOM", 0, -22)
    message:SetWidth(470)
    message:SetJustifyH("CENTER")
    message:SetJustifyV("TOP")

    message:SetText(
        "Need assistance?|n|n" ..
        "Use the buttons below to contact a Game Master, " ..
        "report a problem, request help with a stuck character, " ..
        "or report connection lag.|n|n" ..
        "News, downloads, and account tools:|n" ..
        "|cff00ccffFROZENTHRONE.CO|r"
    )
end

local hiddenWidgets = {
    "KnowledgeBaseFrameTopIssuesButton",
    "KnowledgeBaseFrameEditBox",
    "KnowledgeBaseFrameCategoryDropDown",
    "KnowledgeBaseFrameSubCategoryDropDown",
    "KnowledgeBaseFrameSearchButton",
    "KnowledgeBaseFrameDivider2",
    "KnowledgeBaseArticleListFrame",
    "KnowledgeBaseArticleScrollFrame",
    "KnowledgeBaseErrorFrame"
}

local function ApplyShadowmourneSupport()
    if not KnowledgeBaseFrame then
        return
    end

    CreateSupportPanel()
    BrandTitle()

    if KnowledgeBaseFrameEditBox and
       KnowledgeBaseFrameEditBox.ClearFocus then
        KnowledgeBaseFrameEditBox:ClearFocus()
    end

    for _, widgetName in ipairs(hiddenWidgets) do
        local widget = _G[widgetName]

        if widget then
            widget:Hide()
        end
    end

    SetButtonText(GMChatOpenLog, "View GM Messages")
    SetButtonText(
        KnowledgeBaseFrameGMTalk,
        "Talk to a GM"
    )
    SetButtonText(
        KnowledgeBaseFrameReportIssue,
        "Report Problem"
    )
    SetButtonText(
        KnowledgeBaseFrameStuck,
        "Character Stuck"
    )
    SetButtonText(
        KnowledgeBaseFrameLag,
        "Report Lag"
    )

    if GMChatOpenLog then
        GMChatOpenLog:SetWidth(130)
    end

    if supportPanel then
        supportPanel:Show()
    end
end

local function InitializeShadowmourneSupport()
    if initialized or not KnowledgeBaseFrame then
        return
    end

    initialized = true

    KnowledgeBaseFrame:HookScript(
        "OnShow",
        ApplyShadowmourneSupport
    )

    local functionsToHook = {
        "KnowledgeBaseFrame_ShowSearchFrame",
        "KnowledgeBaseFrame_ShowArticleFrame",
        "KnowledgeBaseFrame_ShowErrorFrame"
    }

    for _, functionName in ipairs(functionsToHook) do
        if type(_G[functionName]) == "function" then
            hooksecurefunc(
                functionName,
                ApplyShadowmourneSupport
            )
        end
    end

    ApplyShadowmourneSupport()
end

local eventFrame = CreateFrame("Frame")
eventFrame:RegisterEvent("PLAYER_LOGIN")

eventFrame:SetScript(
    "OnEvent",
    InitializeShadowmourneSupport
)

InitializeShadowmourneSupport()
